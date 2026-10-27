import { NextResponse } from "next/server";
import { promoteLiveDeals, verifyLiveDeals } from "@/lib/live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The live worker. Re-checks the deals that are due, expires the ones that no
 * longer hold, then looks for a few new drops worth publishing.
 *
 * Protected by CRON_SECRET, and unlike the older jobs this one refuses to run
 * without it: an unauthenticated request could otherwise spend provider quota.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = process.env.CRON_SECRET;
  const provided =
    url.searchParams.get("secret") || req.headers.get("authorization")?.replace("Bearer ", "");

  if (!secret || provided !== secret) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  // 0 is a valid instruction ("do none of this"), so it cannot fall through a
  // `|| default` — that bug turned promote=0 into promote=3 during testing.
  const count = (raw: string | null, fallback: number, max: number) => {
    if (raw === null || raw.trim() === "") return fallback;
    const n = Number(raw);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(Math.max(Math.trunc(n), 0), max);
  };
  const verify = count(url.searchParams.get("verify"), 4, 8);
  const promote = count(url.searchParams.get("promote"), 3, 6);

  try {
    const verified = verify ? await verifyLiveDeals(verify) : [];
    const promoted = promote ? await promoteLiveDeals(promote) : [];
    return NextResponse.json({ ok: true, verified, promoted, ts: Date.now() });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
