import { NextResponse } from "next/server";
import { isAddress, zeroHash } from "viem";
import { assessInvoice, stateLabels, type AgentAssessment } from "@/lib/agent";
import { chainSlug, readInvoiceBundle } from "@/lib/server-contract";
import { formatTokenAmount } from "@/lib/tokens";

export const dynamic = "force-dynamic";

type ExplainRequest = {
  invoiceId?: string;
  account?: string;
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  return explain({
    invoiceId: url.searchParams.get("invoiceId") ?? undefined,
    account: url.searchParams.get("account") ?? undefined
  });
}

export async function POST(request: Request) {
  return explain((await request.json()) as ExplainRequest);
}

async function explain(input: ExplainRequest) {
  try {
    if (!input.invoiceId) {
      return NextResponse.json({ error: "invoiceId is required" }, { status: 400 });
    }
    if (input.account && !isAddress(input.account)) {
      return NextResponse.json({ error: "account must be an address" }, { status: 400 });
    }

    const invoiceId = BigInt(input.invoiceId);
    const { chain, invoice, agentContext, receiptHash, paymentRequirementHash } = await readInvoiceBundle(invoiceId);
    const nowSeconds = Math.floor(Date.now() / 1000);
    const assessment = assessInvoice(
      invoice,
      input.account as `0x${string}` | undefined,
      nowSeconds,
      agentContext,
      receiptHash === zeroHash ? undefined : (receiptHash as `0x${string}`),
      true
    );
    const deterministic = deterministicExplanation(assessment);
    const llm = await maybeOpenAIExplain({
      invoiceId: invoice.id.toString(),
      state: stateLabels[invoice.state] ?? "Unknown",
      amount: formatTokenAmount(invoice.amount, invoice.token),
      paymentRequirementHash: String(paymentRequirementHash),
      headline: assessment.headline,
      enabledActions: assessment.actions.filter((action) => action.enabled).map((action) => action.label),
      blockedActions: assessment.actions.filter((action) => !action.enabled).map((action) => `${action.label}: ${action.reason}`),
      notes: assessment.notes
    });

    return NextResponse.json({
      invoiceId: invoice.id.toString(),
      network: chainSlug(chain.id),
      state: invoice.state,
      stateLabel: stateLabels[invoice.state] ?? "Unknown",
      paymentRequirementHash,
      assessment,
      explanation: llm ?? deterministic,
      explanationSource: llm ? "openai" : "deterministic"
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to explain invoice" },
      { status: 400 }
    );
  }
}

function deterministicExplanation(assessment: AgentAssessment) {
  const enabled = assessment.actions.filter((action) => action.enabled).map((action) => action.label);
  const blocked = assessment.actions.filter((action) => !action.enabled).map((action) => `${action.label}: ${action.reason}`);
  return [
    assessment.headline,
    enabled.length ? `Allowed now: ${enabled.join(", ")}.` : "No transaction action is currently allowed for this wallet.",
    blocked.length ? `Blocked: ${blocked.join("; ")}.` : "",
    assessment.notes.slice(0, 4).join(" ")
  ]
    .filter(Boolean)
    .join(" ");
}

async function maybeOpenAIExplain(summary: Record<string, unknown>) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
        max_output_tokens: 220,
        input: [
          {
            role: "system",
            content:
              "Explain the deterministic MantleFlow escrow assessment in plain English. Do not invent permissions or deployment facts. Keep it under 120 words."
          },
          { role: "user", content: JSON.stringify(summary) }
        ]
      }),
      signal: controller.signal
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { output_text?: string };
    return data.output_text?.trim() || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
