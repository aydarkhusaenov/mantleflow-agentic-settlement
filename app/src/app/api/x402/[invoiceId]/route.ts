import { NextResponse } from "next/server";
import { zeroAddress } from "viem";
import { chainSlug, readInvoiceBundle } from "@/lib/server-contract";
import { stateLabels } from "@/lib/agent";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ invoiceId: string }> }) {
  try {
    const { invoiceId: invoiceIdParam } = await params;
    const invoiceId = BigInt(invoiceIdParam);
    const { address, chain, invoice, paymentRequirementHash } = await readInvoiceBundle(invoiceId);
    const recipient = invoice.recipient;
    const token = invoice.token;
    const amount = invoice.amount;
    const dueAt = invoice.dueAt;
    const timeout = invoice.timeout;
    const state = invoice.state;
    const metadataHash = invoice.metadataHash;

    if (state !== 0) {
      return NextResponse.json({
        status: "settled-or-funded",
        invoiceId: invoiceId.toString(),
        state,
        stateLabel: stateLabels[state] ?? "Unknown",
        paymentRequirementHash
      });
    }

    return NextResponse.json(
      {
        x402Version: 1,
        error: "Payment required to fund this MantleFlow escrow invoice.",
        accepts: [
          {
            scheme: "exact",
            network: chainSlug(chain.id),
            asset: token,
            payTo: address,
            maxAmountRequired: amount.toString(),
            resource: request.url,
            description: `Fund MantleFlow invoice #${invoiceId.toString()}${metadataHash ? ` (${metadataHash})` : ""}`,
            maxTimeoutSeconds: Number(timeout),
            extra: {
              invoiceId: invoiceId.toString(),
              paymentRequirementHash,
              fundingMethod: token === zeroAddress ? "native-payInvoice" : "erc3009-receiveWithAuthorization",
              escrowFunction: token === zeroAddress ? "payInvoice(uint256)" : "payInvoiceWithAuthorization(uint256,address,uint256,uint256,bytes32,uint8,bytes32,bytes32)",
              authorizationNonce: token === zeroAddress ? null : paymentRequirementHash,
              authorizationTo: token === zeroAddress ? null : address,
              token,
              tokenType: token === zeroAddress ? "native" : "erc20",
              recipient,
              dueAt: dueAt.toString(),
              metadataHash
            }
          }
        ]
      },
      { status: 402 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to build payment requirement" },
      { status: 400 }
    );
  }
}
