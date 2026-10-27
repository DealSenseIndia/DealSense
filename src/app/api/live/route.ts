import { NextResponse } from "next/server";
import { getLiveDeals, promoteLiveDeals, verifyLiveDeals } from "@/lib/live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * The live feed. Cached for 20 seconds at the edge, then re-read.
 *
 * GitHub can throttle a five-minute schedule to hourly, which would leave the
 * feed empty between runs — so a read also does a small verification sweep
 * (at most once every four minutes per instance). The feed repairs itself when
 * someone is actually looking, instead of depending on perfect cron timing.
 */
let lastSweep = 0;

export async function GET() {
  try {
    const now = Date.now();
    if (now - lastSweep > 4 * 60 * 1000) {
      lastSweep = now;
      await verifyLiveDeals(2).catch(() => {});
    }
    let deals = await getLiveDeals(30);
    if (!deals.length) {
      // Nothing live: look for one honest drop so the feed is not empty just
      // because the scheduler was throttled.
      await promoteLiveDeals(1).catch(() => {});
      deals = await getLiveDeals(30);
    }
    return NextResponse.json(
      { ok: true, count: deals.length, generatedAt: Date.now(), deals },
      {
        headers: {
          "Cache-Control": "public, s-maxage=20, stale-while-revalidate=40",
        },
      },
    );
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
