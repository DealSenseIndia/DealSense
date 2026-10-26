import { NextResponse } from "next/server";
import { z } from "zod";
import { getSetupCoverage } from "@/lib/setups/engine";
import { buildSetupCached } from "@/lib/setups/cached";
import { getSetupMeta } from "@/lib/setups/meta";
import { isSetupSpace, DEFAULT_SPACE } from "@/lib/setups/blueprints";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const Body = z.object({
  space: z.string().trim().max(40).optional(),
  budget: z.number().finite().min(0).max(10_000_000).optional(),
  owned: z.array(z.string().trim().max(40)).max(12).optional(),
  style: z.string().trim().max(40).optional(),
});

/** GET returns the configurator metadata; ?coverage=1 adds the honest fill map. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("coverage") !== "1") {
    return NextResponse.json({ ok: true, meta: getSetupMeta() });
  }
  try {
    const coverage = await getSetupCoverage();
    return NextResponse.json({ ok: true, meta: getSetupMeta(), coverage });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Send JSON { space, budget, owned, style }." },
      { status: 400 },
    );
  }

  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid setup request." }, { status: 400 });
  }

  const space = parsed.data.space && isSetupSpace(parsed.data.space)
    ? parsed.data.space
    : DEFAULT_SPACE;

  try {
    const setup = await buildSetupCached(
      space,
      parsed.data.budget ?? 0,
      parsed.data.style ?? "no_preference",
      parsed.data.owned ?? [],
    );
    return NextResponse.json({ ok: true, setup });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
