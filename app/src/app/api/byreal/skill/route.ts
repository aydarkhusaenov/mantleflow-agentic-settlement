import { NextResponse } from "next/server";
import { encodeFunctionData, isAddress, zeroAddress, zeroHash } from "viem";
import { assessInvoice, stateLabels, type AgentAction } from "@/lib/agent";
import { invoiceEscrowAbi } from "@/lib/abi";
import { chainSlug, getEscrowAddress, readInvoiceBundle } from "@/lib/server-contract";
import { formatTokenAmount } from "@/lib/tokens";

export const dynamic = "force-dynamic";

type ByrealSkillRequest = {
  tool?: string;
  invoiceId?: string | number | bigint;
  account?: string;
  action?: AgentAction["id"];
};

const txActions = {
  pay: "payInvoice",
  release: "release",
  requestRefund: "requestRefund",
  refund: "refund",
  cancel: "cancelUnpaid",
  acceptSettlement: "acceptSettlement"
} as const satisfies Record<AgentAction["id"], string>;

const actionPriority: AgentAction["id"][] = ["acceptSettlement", "release", "refund", "requestRefund", "pay", "cancel"];

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  return NextResponse.json(skillCatalog(origin));
}

export async function POST(request: Request) {
  const origin = new URL(request.url).origin;
  const body = (await request.json().catch(() => ({}))) as ByrealSkillRequest;
  const tool = String(body.tool ?? "catalog");

  try {
    if (tool === "catalog") {
      return NextResponse.json(skillCatalog(origin));
    }

    if (tool === "settlement_context") {
      return NextResponse.json(await settlementContext(body, origin));
    }

    if (tool === "autonomous_next_action") {
      return NextResponse.json(await autonomousNextAction(body, origin));
    }

    if (tool === "build_unsigned_call") {
      const invoiceId = parseInvoiceId(body.invoiceId);
      const action = parseAction(body.action);
      return NextResponse.json(await buildUnsignedCall(invoiceId, action));
    }

    if (tool === "receipt_proof") {
      const invoiceId = parseInvoiceId(body.invoiceId);
      const { chain, invoice, agentContext, receiptHash, paymentRequirementHash } = await readInvoiceBundle(invoiceId);
      return NextResponse.json({
        invoiceId: invoice.id.toString(),
        network: chainSlug(chain.id),
        state: stateLabels[invoice.state] ?? "Unknown",
        receiptUrl: `${origin}/api/receipt/${invoice.id.toString()}`,
        receiptHash,
        receiptReady: receiptHash !== zeroHash,
        paymentRequirementHash,
        ap2Mandates: {
          intentMandateHash: agentContext.intentMandateHash,
          cartMandateHash: agentContext.cartMandateHash,
          paymentMandateHash: agentContext.paymentMandateHash,
          promptPlaybackHash: agentContext.promptPlaybackHash
        },
        evidence: {
          deliveryCount: invoice.deliveryEvidenceCount.toString(),
          deliveryRoot: invoice.deliveryEvidenceRoot,
          disputeCount: invoice.disputeEvidenceCount.toString(),
          disputeRoot: invoice.disputeEvidenceRoot
        }
      });
    }

    return NextResponse.json({ error: `Unknown Byreal skill tool: ${tool}` }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Byreal skill call failed" },
      { status: 400 }
    );
  }
}

async function settlementContext(body: ByrealSkillRequest, origin: string) {
  const invoiceId = parseInvoiceId(body.invoiceId);
  const account = parseOptionalAddress(body.account);
  const { address, chain, invoice, agentContext, receiptHash, paymentRequirementHash } = await readInvoiceBundle(invoiceId);
  const assessment = assessInvoice(
    invoice,
    account,
    Math.floor(Date.now() / 1000),
    agentContext,
    receiptHash === zeroHash ? undefined : (receiptHash as `0x${string}`),
    true
  );

  return {
    skill: "mantleflow.settlement",
    escrow: address,
    network: chainSlug(chain.id),
    invoice: {
      id: invoice.id.toString(),
      state: stateLabels[invoice.state] ?? "Unknown",
      amount: formatTokenAmount(invoice.amount, invoice.token),
      token: invoice.token,
      payer: invoice.payer,
      recipient: invoice.recipient,
      metadataHash: invoice.metadataHash,
      paymentRequirementHash,
      receiptHash,
      receiptUrl: `${origin}/api/receipt/${invoice.id.toString()}`
    },
    assessment
  };
}

async function autonomousNextAction(body: ByrealSkillRequest, origin: string) {
  const context = await settlementContext(body, origin);
  const selected = actionPriority
    .map((id) => context.assessment.actions.find((action) => action.id === id))
    .find((action): action is AgentAction => Boolean(action?.enabled));

  const unsignedCall = selected ? await buildUnsignedCall(BigInt(context.invoice.id), selected.id) : null;

  return {
    skill: "mantleflow.settlement",
    mode: "deterministic-dry-run",
    autonomy: {
      selectedAction: selected?.id ?? null,
      selectedLabel: selected?.label ?? null,
      reason: selected?.reason ?? "No safe autonomous action is currently available for this wallet and invoice state.",
      requiresExternalSignature: Boolean(selected),
      broadcastsTransaction: false
    },
    unsignedCall,
    context
  };
}

async function buildUnsignedCall(invoiceId: bigint, action: AgentAction["id"]) {
  const { invoice } = await readInvoiceBundle(invoiceId);
  return {
    to: getEscrowAddress(),
    chainId: 5003,
    value: action === "pay" && invoice.token === zeroAddress ? invoice.amount.toString() : "0",
    data: encodeFunctionData({
      abi: invoiceEscrowAbi,
      functionName: txActions[action],
      args: [invoiceId]
    }),
    action,
    invoiceId: invoiceId.toString(),
    safety:
      "Unsigned call only. Submit through a wallet, Byreal-compatible agent account, or another signer after checking the returned plan and calldata."
  };
}

function skillCatalog(origin: string) {
  return {
    skill: "mantleflow.settlement",
    title: "MantleFlow Settlement Skill",
    version: "0.1.0",
    track: "Agentic Economy",
    tools: ["settlement_context", "autonomous_next_action", "build_unsigned_call", "receipt_proof"],
    manifest: `${origin}/.well-known/byreal-skill.json`,
    mcp: `${origin}/api/mcp`,
    docs: "docs/BYREAL_SKILL.md"
  };
}

function parseInvoiceId(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "bigint") {
    throw new Error("invoiceId is required");
  }
  return BigInt(value);
}

function parseAction(value: unknown): AgentAction["id"] {
  if (typeof value !== "string" || !(value in txActions)) {
    throw new Error("action must be one of pay, release, requestRefund, refund, cancel, acceptSettlement");
  }
  return value as AgentAction["id"];
}

function parseOptionalAddress(value: unknown) {
  if (typeof value !== "string" || !value) return undefined;
  if (!isAddress(value)) throw new Error("account must be an address");
  return value;
}
