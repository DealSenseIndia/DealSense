import { NextResponse } from "next/server";
import { runProviderSync } from "@/lib/engine/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Provider sync endpoint — tops up the public PriceHistory.ai series for a
 * few of the deepest tracked listings per run. Protected by CRON_SECRET.
 *
 * Hourly GitHub Actions (:sync) keeps the homepage moving; a daily Vercel
 * cron is the fallback if the workflow is disabled.
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
    const report = await runProviderSync(limit);
    return NextResponse.json({ ok: true, ...report });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
