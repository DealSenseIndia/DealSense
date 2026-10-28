import { NextResponse } from "next/server";
import { runRefreshCycle } from "@/lib/engine/worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Cron endpoint. Point a free scheduler at this every minute with `limit=4`.
 *
 * Each listing is rescheduled ten hours after a successful read, so covering
 * the whole catalogue needs ~4,900 reads a day — four per minute is enough.
 * The cycle stops starting new listings after 50 seconds, so a slow scrape
 * never gets cut off by the 60s function limit.
 *
 * Protected by CRON_SECRET so it can never be abused as an open scraper.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = process.env.CRON_SECRET;
  const provided = url.searchParams.get("secret") || req.headers.get("authorization")?.replace("Bearer ", "");

  if (secret && provided !== secret) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const limit = Math.min(Number(url.searchParams.get("limit") ?? 4) || 4, 10);
  try {
    const report = await runRefreshCycle(limit);
    return NextResponse.json({ ok: true, ...report });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
