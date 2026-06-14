import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  return NextResponse.json({
    name: "MantleFlow Agentic Escrow",
    description:
      "Non-custodial Arbitrum escrow for agent-created invoices, x402/EIP-3009 funding, scoped settlement actions, evidence roots, service bonds, and portable receipts.",
    version: "0.1.0",
    provider: {
      name: "MantleFlow",
      url: origin
    },
    networks: [
      {
        name: "Arbitrum Sepolia",
        chainId: 421614
      },
      {
        name: "Robinhood Chain Testnet",
        chainId: 46630
      },
      {
        name: "Hardhat",
        chainId: 31337
      }
    ],
    capabilities: [
      "create_invoice",
      "x402_payment_requirement",
      "pay_invoice_with_authorization",
      "assess_invoice",
      "simulate_action",
      "structured_receipt",
      "ap2_mandate_hashes",
      "erc8004_reputation_summary",
      "tee_validation_attestation_hash",
      "tokenized_stock_invoice_demo"
    ],
    endpoints: {
      x402PaymentRequirement: `${origin}/api/x402/{invoiceId}`,
      x402Verify: `${origin}/api/x402/verify`,
      explain: `${origin}/api/agent/explain?invoiceId={invoiceId}&account={address}`,
      simulate: `${origin}/api/agent/simulate?invoiceId={invoiceId}&action={action}&account={address}`,
      receipt: `${origin}/api/receipt/{invoiceId}`,
      activity: `${origin}/activity`
    }
  });
}
