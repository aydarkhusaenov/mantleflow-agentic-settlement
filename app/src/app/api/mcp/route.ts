import { NextResponse } from "next/server";
import { encodeFunctionData, isAddress, zeroAddress, zeroHash } from "viem";
import { assessInvoice, stateLabels, type AgentAction } from "@/lib/agent";
import { invoiceEscrowAbi } from "@/lib/abi";
import { chainSlug, getEscrowAddress, readInvoiceBundle } from "@/lib/server-contract";
import { formatTokenAmount } from "@/lib/tokens";

export const dynamic = "force-dynamic";

type JsonRpcRequest = {
  id?: string | number | null;
  method?: string;
  params?: {
    name?: string;
    arguments?: Record<string, unknown>;
  };
};

const txActions = {
  pay: "payInvoice",
  release: "release",
  requestRefund: "requestRefund",
  refund: "refund",
  cancel: "cancelUnpaid",
  acceptSettlement: "acceptSettlement"
} as const satisfies Record<AgentAction["id"], string>;

export async function GET() {
  return NextResponse.json({
    name: "MantleFlow MCP",
    transport: "http-json-rpc",
    methods: ["initialize", "tools/list", "tools/call"]
  });
}

export async function POST(request: Request) {
  const body = (await request.json()) as JsonRpcRequest;
  try {
    if (body.method === "initialize") {
      return rpc(body.id, {
        protocolVersion: "2025-06-18",
        serverInfo: { name: "mantleflow-mcp", version: "0.1.0" },
        capabilities: { tools: {} }
      });
    }
    if (body.method === "tools/list") {
      return rpc(body.id, { tools });
    }
    if (body.method === "tools/call") {
      return rpc(body.id, await callTool(body.params?.name, body.params?.arguments ?? {}, request.url));
    }
    return rpcError(body.id, -32601, "Method not found");
  } catch (error) {
    return rpcError(body.id, -32000, error instanceof Error ? error.message : "Tool call failed");
  }
}

async function callTool(name: string | undefined, args: Record<string, unknown>, requestUrl: string) {
  if (!name) throw new Error("Tool name is required");
  const origin = new URL(requestUrl).origin;

  if (name === "get_invoice" || name === "assess_invoice" || name === "get_receipt") {
    const invoiceId = parseInvoiceId(args.invoiceId);
    const { address, chain, invoice, agentContext, receiptHash, paymentRequirementHash } = await readInvoiceBundle(invoiceId);
    const content =
      name === "get_invoice"
        ? {
            escrow: address,
            network: chainSlug(chain.id),
            invoiceId: invoice.id.toString(),
            state: stateLabels[invoice.state] ?? "Unknown",
            amount: formatTokenAmount(invoice.amount, invoice.token),
            payer: invoice.payer,
            recipient: invoice.recipient,
            token: invoice.token,
            paymentRequirementHash,
            agentContext: {
              payerAgentHash: agentContext.payerAgentHash,
              recipientAgentHash: agentContext.recipientAgentHash,
              mandateHash: agentContext.mandateHash,
              policyHash: agentContext.policyHash,
              intentMandateHash: agentContext.intentMandateHash,
              cartMandateHash: agentContext.cartMandateHash,
              paymentMandateHash: agentContext.paymentMandateHash,
              promptPlaybackHash: agentContext.promptPlaybackHash
            }
          }
        : name === "get_receipt"
          ? {
              receiptUrl: `${origin}/api/receipt/${invoice.id.toString()}`,
              receiptHash,
              paymentRequirementHash,
              finalState: stateLabels[invoice.state] ?? "Unknown",
              ap2: {
                intentMandateHash: agentContext.intentMandateHash,
                cartMandateHash: agentContext.cartMandateHash,
                paymentMandateHash: agentContext.paymentMandateHash,
                promptPlaybackHash: agentContext.promptPlaybackHash
              }
            }
          : {
              assessment: assessInvoice(
                invoice,
                parseOptionalAddress(args.account),
                Math.floor(Date.now() / 1000),
                agentContext,
                receiptHash === zeroHash ? undefined : (receiptHash as `0x${string}`),
                true
              )
            };
    return textResult(content);
  }

  if (name === "x402_payment_requirement") {
    const invoiceId = parseInvoiceId(args.invoiceId);
    return textResult({ url: `${origin}/api/x402/${invoiceId.toString()}` });
  }

  if (name === "build_unsigned_call") {
    const invoiceId = parseInvoiceId(args.invoiceId);
    const action = String(args.action ?? "") as AgentAction["id"];
    if (!(action in txActions)) throw new Error("Unsupported action");
    const { invoice } = await readInvoiceBundle(invoiceId);
    return textResult({
      to: getEscrowAddress(),
      value: action === "pay" && invoice.token === zeroAddress ? invoice.amount.toString() : "0",
      data: encodeFunctionData({
        abi: invoiceEscrowAbi,
        functionName: txActions[action],
        args: [invoiceId]
      })
    });
  }

  throw new Error(`Unknown tool: ${name}`);
}

const tools = [
  {
    name: "get_invoice",
    description: "Read a MantleFlow invoice and its payment requirement hash.",
    inputSchema: invoiceSchema()
  },
  {
    name: "assess_invoice",
    description: "Run deterministic MantleFlow agent policy for an invoice and optional wallet address.",
    inputSchema: {
      type: "object",
      properties: {
        invoiceId: { type: "string" },
        account: { type: "string" }
      },
      required: ["invoiceId"]
    }
  },
  {
    name: "x402_payment_requirement",
    description: "Return the HTTP 402 payment requirement URL for an invoice.",
    inputSchema: invoiceSchema()
  },
  {
    name: "get_receipt",
    description: "Return the structured receipt URL and on-chain receipt hash.",
    inputSchema: invoiceSchema()
  },
  {
    name: "build_unsigned_call",
    description: "Build unsigned calldata for a wallet or agent account to execute a common invoice action.",
    inputSchema: {
      type: "object",
      properties: {
        invoiceId: { type: "string" },
        action: { type: "string", enum: Object.keys(txActions) }
      },
      required: ["invoiceId", "action"]
    }
  }
] as const;

function invoiceSchema() {
  return {
    type: "object",
    properties: { invoiceId: { type: "string" } },
    required: ["invoiceId"]
  };
}

function parseInvoiceId(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "bigint") {
    throw new Error("invoiceId is required");
  }
  return BigInt(value);
}

function parseOptionalAddress(value: unknown) {
  if (typeof value !== "string" || !value) return undefined;
  if (!isAddress(value)) throw new Error("account must be an address");
  return value;
}

function textResult(value: unknown) {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }]
  };
}

function rpc(id: JsonRpcRequest["id"], result: unknown) {
  return NextResponse.json({ jsonrpc: "2.0", id: id ?? null, result });
}

function rpcError(id: JsonRpcRequest["id"], code: number, message: string) {
  return NextResponse.json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });
}
