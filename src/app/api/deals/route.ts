import { NextResponse } from "next/server";
import { getLiveDeals } from "@/lib/engine/deals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 48) || 48, 100);
  try {
    const deals = await getLiveDeals(limit);
    return NextResponse.json({ ok: true, count: deals.length, deals });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
