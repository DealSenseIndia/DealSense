import { NextResponse } from "next/server";
import { z } from "zod";
import { addAlert } from "@/lib/engine/alerts";
import { listAlerts, listAlertsByContact } from "@/lib/db/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateBody = z.object({
  productId: z.string().min(1),
  listingId: z.string().min(1),
  alertType: z.enum(["TARGET_PRICE", "PERCENT_DROP", "DEAL_SCORE"]).default("TARGET_PRICE"),
  targetPrice: z.number().positive().optional(),
  baselinePrice: z.number().positive().optional(),
  targetPercent: z.number().positive().max(90).optional(),
  targetScore: z.number().int().min(1).max(100).optional(),
  channel: z.enum(["telegram", "email", "console"]).default("telegram"),
  contact: z.string().max(200).optional(),
  isPersistent: z.boolean().default(true),
});

export async function GET(req: Request) {
  const url = new URL(req.url);
  const contact = url.searchParams.get("contact");
  try {
    const rows = contact ? await listAlertsByContact(contact) : await listAlerts();
    return NextResponse.json({ ok: true, count: rows.length, alerts: rows });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Send JSON body." }, { status: 400 });
  }
  const parsed = CreateBody.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid alert", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const d = parsed.data;

  // There is no delivery path without a Telegram bot, and email was never
  // implemented. Refuse the promise instead of storing an alert that can
  // never fire.
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    return NextResponse.json(
      {
        ok: false,
        error: "Price-drop alerts aren't live yet. They open when the Telegram bot is connected.",
      },
      { status: 503 },
    );
  }
  if (d.channel === "email") {
    return NextResponse.json(
      { ok: false, error: "Email alerts aren't available yet. Choose Telegram." },
      { status: 400 },
    );
  }

  if (d.alertType === "TARGET_PRICE" && !d.targetPrice) {
    return NextResponse.json({ ok: false, error: "targetPrice is required." }, { status: 400 });
  }
  if (d.alertType === "PERCENT_DROP" && !d.targetPercent) {
    return NextResponse.json({ ok: false, error: "targetPercent is required." }, { status: 400 });
  }
  if (d.alertType === "DEAL_SCORE" && !d.targetScore) {
    return NextResponse.json({ ok: false, error: "targetScore is required." }, { status: 400 });
  }

  try {
    const alert = await addAlert(d);
    return NextResponse.json({ ok: true, alert }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
