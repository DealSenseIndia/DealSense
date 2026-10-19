import { NextResponse } from "next/server";
import { getObservations } from "@/lib/db/queries";
import { computeStats, priceSeries } from "@/lib/engine/stats";
import { evaluateDeal } from "@/lib/engine/verdict";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ listingId: string }> },
) {
  const { listingId } = await params;
  try {
    const obs = await getObservations(listingId);
    const stats = computeStats(obs);
    const series = priceSeries(obs);
    const last = series[series.length - 1]?.price ?? null;
    const verdict = last !== null ? evaluateDeal({ current: last, stats }) : null;

    return NextResponse.json({
      ok: true,
      has_sufficient_history: stats.count >= 3,
      count: stats.count,
      stats,
      series,
      verdict,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
