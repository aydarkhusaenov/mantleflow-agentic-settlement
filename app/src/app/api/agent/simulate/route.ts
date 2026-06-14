import { NextResponse } from "next/server";
import { isAddress, zeroAddress } from "viem";
import { assessInvoice, type AgentAction } from "@/lib/agent";
import { invoiceEscrowAbi } from "@/lib/abi";
import { getEscrowAddress, getServerClient, readInvoiceBundle } from "@/lib/server-contract";

export const dynamic = "force-dynamic";

const actionToFunction = {
  pay: "payInvoice",
  release: "release",
  requestRefund: "requestRefund",
  refund: "refund",
  cancel: "cancelUnpaid",
  acceptSettlement: "acceptSettlement"
} as const satisfies Record<AgentAction["id"], string>;

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const invoiceIdParam = url.searchParams.get("invoiceId");
    const action = url.searchParams.get("action") as AgentAction["id"] | null;
    const account = url.searchParams.get("account");

    if (!invoiceIdParam) return NextResponse.json({ error: "invoiceId is required" }, { status: 400 });
    if (!action || !(action in actionToFunction)) return NextResponse.json({ error: "unsupported action" }, { status: 400 });
    if (!account || !isAddress(account)) return NextResponse.json({ error: "account must be an address" }, { status: 400 });

    const invoiceId = BigInt(invoiceIdParam);
    const { invoice, agentContext, receiptHash } = await readInvoiceBundle(invoiceId);
    const assessment = assessInvoice(
      invoice,
      account,
      Math.floor(Date.now() / 1000),
      agentContext,
      receiptHash as `0x${string}`,
      true
    );
    const actionAssessment = assessment.actions.find((item) => item.id === action);
    const simulation = await simulateContractAction(invoiceId, action, account, invoice.token === zeroAddress ? invoice.amount : undefined);

    return NextResponse.json({
      invoiceId: invoiceId.toString(),
      action,
      deterministicAllowed: Boolean(actionAssessment?.enabled),
      deterministicReason: actionAssessment?.reason ?? "Action is not available in this invoice state.",
      ethCallAllowed: simulation.allowed,
      ethCallReason: simulation.reason
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to simulate action" },
      { status: 400 }
    );
  }
}

async function simulateContractAction(
  invoiceId: bigint,
  action: AgentAction["id"],
  account: `0x${string}`,
  value?: bigint
) {
  const client = getServerClient();
  try {
    if (action === "pay") {
      await client.simulateContract({
        address: getEscrowAddress(),
        abi: invoiceEscrowAbi,
        functionName: "payInvoice",
        args: [invoiceId],
        account,
        value
      });
      return { allowed: true, reason: "eth_call simulation succeeded." };
    }

    await client.simulateContract({
      address: getEscrowAddress(),
      abi: invoiceEscrowAbi,
      functionName: actionToFunction[action],
      args: [invoiceId],
      account
    });
    return { allowed: true, reason: "eth_call simulation succeeded." };
  } catch (error) {
    const details = error as { shortMessage?: string; message?: string };
    return {
      allowed: false,
      reason: details.shortMessage || details.message || "eth_call simulation reverted."
    };
  }
}
