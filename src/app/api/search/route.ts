import { NextResponse } from "next/server";
import { searchAll } from "@/lib/merchants/search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ ok: true, count: 0, results: [] });

  try {
    const results = await searchAll(q, 12);
    return NextResponse.json({ ok: true, count: results.length, results });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
