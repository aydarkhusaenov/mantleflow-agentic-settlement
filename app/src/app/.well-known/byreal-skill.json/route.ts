import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;

  return NextResponse.json({
    schema: "byreal-agent-skill",
    name: "mantleflow.settlement",
    title: "MantleFlow Settlement Skill",
    version: "0.1.0",
    description:
      "A Mantle-native settlement skill for agentic wallet economies: invoice state, x402-style payment requirements, autonomous policy planning, unsigned transaction generation, receipt proof, feedback, and validator attestation context.",
    network: {
      name: "Mantle Sepolia",
      chainId: 5003,
      nativeToken: "MNT",
      explorer: "https://sepolia.mantlescan.xyz"
    },
    byrealFit: {
      track: "Agentic Economy",
      integrationMode: "Agent Skills compatible adapter",
      autonomyModel:
        "The skill makes deterministic settlement decisions and builds unsigned calls; wallet or agent-account infrastructure remains responsible for final signing.",
      verificationModel:
        "All meaningful outcomes are verifiable through Mantle transaction hashes, receipt hashes, delivery/dispute evidence roots, feedback roots, and validator attestation roots."
    },
    tools: [
      {
        name: "settlement_context",
        method: "POST",
        endpoint: `${origin}/api/byreal/skill`,
        input: { tool: "settlement_context", invoiceId: "uint256", account: "optional address" }
      },
      {
        name: "autonomous_next_action",
        method: "POST",
        endpoint: `${origin}/api/byreal/skill`,
        input: { tool: "autonomous_next_action", invoiceId: "uint256", account: "address" }
      },
      {
        name: "build_unsigned_call",
        method: "POST",
        endpoint: `${origin}/api/byreal/skill`,
        input: { tool: "build_unsigned_call", invoiceId: "uint256", action: "pay|release|requestRefund|refund|cancel|acceptSettlement" }
      },
      {
        name: "receipt_proof",
        method: "POST",
        endpoint: `${origin}/api/byreal/skill`,
        input: { tool: "receipt_proof", invoiceId: "uint256" }
      }
    ],
    safety: [
      "No private keys are accepted.",
      "No transaction is broadcast by this endpoint.",
      "Unsigned calls are bound to one invoice and one contract function.",
      "Agent plans include reasons and disabled-action explanations for auditability."
    ]
  });
}
