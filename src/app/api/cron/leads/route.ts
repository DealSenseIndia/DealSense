import { NextResponse } from "next/server";
import { ingestLeads } from "@/lib/leads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Lead worker. Reads the public previews of a few deal channels, takes only
 * outbound product links, resolves them to store ids, and lets our own
 * provider decide whether there is a real price history behind them.
 *
 * Protected by CRON_SECRET like the other workers.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = process.env.CRON_SECRET;
  const provided =
    url.searchParams.get("secret") || req.headers.get("authorization")?.replace("Bearer ", "");

  if (!secret || provided !== secret) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const raw = Number(url.searchParams.get("limit") ?? 3);
  const limit = Math.min(Math.max(Number.isFinite(raw) ? Math.trunc(raw) : 3, 1), 5);

  try {
    const leads = await ingestLeads(limit);
    return NextResponse.json({ ok: true, count: leads.length, leads, ts: Date.now() });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
