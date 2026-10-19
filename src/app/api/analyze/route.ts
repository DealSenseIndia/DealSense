import { NextResponse } from "next/server";
import { z } from "zod";
import { analyzeUrl } from "@/lib/engine/analyze";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({
  url: z.string().min(4).max(2048),
});

export async function POST(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ ok: false, status: "INVALID_URL", message: "Send JSON { url }." }, { status: 400 });
  }

  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, status: "INVALID_URL", message: "A product URL is required." }, { status: 400 });
  }

  try {
    const result = await analyzeUrl(parsed.data.url);
    return NextResponse.json(result, { status: result.ok ? 200 : 200 });
  } catch (err) {
    return NextResponse.json(
      { ok: false, status: "NETWORK_ERROR", message: (err as Error).message },
      { status: 500 },
    );
  }
}
