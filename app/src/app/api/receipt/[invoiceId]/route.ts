import { NextResponse } from "next/server";
import { stateLabels } from "@/lib/agent";
import { chainSlug, readInvoiceBundle } from "@/lib/server-contract";
import { formatTokenAmount } from "@/lib/tokens";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ invoiceId: string }> }) {
  try {
    const { invoiceId: invoiceIdParam } = await params;
    const invoiceId = BigInt(invoiceIdParam);
    const { address, chain, invoice, agentContext, paymentRequirementHash, receiptHash } = await readInvoiceBundle(invoiceId);

    return NextResponse.json({
      receiptVersion: "MantleFlow_AGENT_SETTLEMENT_RECEIPT_V1",
      chainId: chain.id,
      network: chainSlug(chain.id),
      escrow: address,
      invoiceId: invoice.id.toString(),
      receiptHash,
      paymentRequirementHash,
      amountFormatted: formatTokenAmount(invoice.amount, invoice.token),
      invoice: {
        creator: invoice.creator,
        payer: invoice.payer,
        recipient: invoice.recipient,
        token: invoice.token,
        amount: invoice.amount.toString(),
        state: invoice.state,
        stateLabel: stateLabels[invoice.state] ?? "Unknown",
        metadataHash: invoice.metadataHash,
        deliveryHash: invoice.deliveryHash,
        deliveryMarkedAt: invoice.deliveryMarkedAt.toString(),
        deliveryEvidenceCount: invoice.deliveryEvidenceCount.toString(),
        deliveryEvidenceRoot: invoice.deliveryEvidenceRoot,
        disputeHash: invoice.disputeHash,
        disputeMarkedAt: invoice.disputeMarkedAt.toString(),
        disputeEvidenceCount: invoice.disputeEvidenceCount.toString(),
        disputeEvidenceRoot: invoice.disputeEvidenceRoot,
        settlementMemoHash: invoice.settlementMemoHash,
        settlementRecipientAmount: invoice.settlementRecipientAmount.toString()
      },
      bond: {
        resolvedAmount: invoice.resolvedBondAmount.toString(),
        resolvedRecipient: invoice.resolvedBondRecipient,
        slashed: invoice.serviceBondSlashed
      },
      agentContext: {
        payerAgentHash: agentContext.payerAgentHash,
        recipientAgentHash: agentContext.recipientAgentHash,
        mandateHash: agentContext.mandateHash,
        policyHash: agentContext.policyHash,
        intentMandateHash: agentContext.intentMandateHash,
        cartMandateHash: agentContext.cartMandateHash,
        paymentMandateHash: agentContext.paymentMandateHash,
        promptPlaybackHash: agentContext.promptPlaybackHash,
        slaDeadline: agentContext.slaDeadline.toString(),
        authorizedPayer: agentContext.authorizedPayer,
        mandateExpiresAt: agentContext.mandateExpiresAt.toString()
      }
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to read receipt" },
      { status: 400 }
    );
  }
}
