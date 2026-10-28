import { NextResponse } from "next/server";
import { runPriceAudit } from "@/lib/engine/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Daily price-plausibility sweep. Re-reads listings whose live price is under
 * 20% of their own recorded average and removes the ones the store confirms
 * are absurd. Protected by CRON_SECRET like every other worker.
 *
 * `limit` caps how many listings one run may touch (default 5, max 10) so a
 * single request stays inside the 60s function ceiling.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = process.env.CRON_SECRET;
  const provided =
    url.searchParams.get("secret") || req.headers.get("authorization")?.replace("Bearer ", "");

  if (secret && provided !== secret) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const limit = Math.min(Number(url.searchParams.get("limit") ?? 5) || 5, 10);
  try {
    const report = await runPriceAudit(limit);
    return NextResponse.json({ ok: true, ...report });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
