import { NextResponse } from "next/server";
import { runRefreshCycle } from "@/lib/engine/worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Cron endpoint. Point a free scheduler at this (Vercel Cron, GitHub Actions…).
 * Protected by CRON_SECRET so it can never be abused as an open scraper.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = process.env.CRON_SECRET;
  const provided = url.searchParams.get("secret") || req.headers.get("authorization")?.replace("Bearer ", "");

  if (secret && provided !== secret) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const limit = Math.min(Number(url.searchParams.get("limit") ?? 3) || 3, 10);
  try {
    const report = await runRefreshCycle(limit);
    return NextResponse.json({ ok: true, ...report });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
