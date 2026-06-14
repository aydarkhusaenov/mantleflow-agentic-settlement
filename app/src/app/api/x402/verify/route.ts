import { NextResponse } from "next/server";
import { chainSlug, readInvoiceBundle } from "@/lib/server-contract";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { invoiceId?: string; paymentRequirementHash?: string };
    if (!body.invoiceId) {
      return NextResponse.json({ error: "invoiceId is required" }, { status: 400 });
    }

    const invoiceId = BigInt(body.invoiceId);
    const { chain, paymentRequirementHash } = await readInvoiceBundle(invoiceId);
    const expected = paymentRequirementHash.toLowerCase();
    const supplied = body.paymentRequirementHash?.toLowerCase();

    return NextResponse.json({
      valid: supplied ? supplied === expected : true,
      invoiceId: invoiceId.toString(),
      network: chainSlug(chain.id),
      paymentRequirementHash
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to verify payment requirement" },
      { status: 400 }
    );
  }
}
