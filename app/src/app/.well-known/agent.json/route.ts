import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  return NextResponse.json({
    name: "MantleFlow Agentic Escrow",
    description:
      "Non-custodial Mantle escrow for agent-created invoices, x402-style payment requirements, scoped settlement actions, evidence roots, service bonds, validator attestations, and portable receipts.",
    version: "0.1.0",
    provider: {
      name: "MantleFlow",
      url: origin
    },
    networks: [
      {
        name: "Mantle Sepolia",
        chainId: 5003,
        contractAddress: "0x7D0893625B9f8F0d5B84531393B84dE5624bAa78"
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
      "byreal_agent_skill_adapter",
      "autonomous_settlement_plan"
    ],
    endpoints: {
      byrealSkillManifest: `${origin}/.well-known/byreal-skill.json`,
      byrealSkillApi: `${origin}/api/byreal/skill`,
      mcp: `${origin}/api/mcp`,
      x402PaymentRequirement: `${origin}/api/x402/{invoiceId}`,
      x402Verify: `${origin}/api/x402/verify`,
      explain: `${origin}/api/agent/explain?invoiceId={invoiceId}&account={address}`,
      simulate: `${origin}/api/agent/simulate?invoiceId={invoiceId}&action={action}&account={address}`,
      receipt: `${origin}/api/receipt/{invoiceId}`,
      activity: `${origin}/activity`
    }
  });
}
