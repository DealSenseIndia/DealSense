import { NextResponse } from "next/server";
import { getEventCounts, getRecentListings } from "@/lib/db/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  try {
    const [counts, recent] = await Promise.all([getEventCounts(dayAgo), getRecentListings(1)]);
    const map = Object.fromEntries(counts.map((c) => [c.type, c.n]));
    return NextResponse.json({
      is_running: true,
      merchant_queues: { amazon: "ready", flipkart: "ready" },
      stats: {
        analyses_24h: map["analyze"] ?? 0,
        alerts_24h: map["alert"] ?? 0,
        last_scan_at: recent[0]?.lastCheckedAt ?? null,
      },
      ts: Date.now(),
    });
  } catch (err) {
    return NextResponse.json({ is_running: false, error: (err as Error).message }, { status: 500 });
  }
}
