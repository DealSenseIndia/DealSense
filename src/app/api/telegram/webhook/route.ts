import { NextResponse } from "next/server";
import { getAlertById, updateAlert } from "@/lib/db/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Telegram webhook.
 * Flow: PDP → deep link t.me/<bot>?start=alert_<id> → user taps START →
 * we bind their chat id to the alert and arm it.
 */
export async function POST(req: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret && req.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let update: any;
  try {
    update = await req.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  const message = update?.message ?? update?.edited_message;
  const text: string = message?.text ?? "";
  const chatId = message?.chat?.id ? String(message.chat.id) : null;

  if (chatId && text.startsWith("/start")) {
    const payload = text.split(" ")[1] ?? "";
    if (payload.startsWith("alert_")) {
      const alertId = payload.replace("alert_", "");
      const alert = await getAlertById(alertId);
      if (alert) {
        await updateAlert(alertId, { contact: chatId, status: "ARMED", channel: "telegram" });
        await reply(chatId, "✅ DealSense alert armed. We'll message you the moment this price drops.");
        return NextResponse.json({ ok: true });
      }
    }
    await reply(chatId, "👋 Welcome to DealSense. Open a product page and tap “Track price” to set an alert.");
  }

  return NextResponse.json({ ok: true });
}

async function reply(chatId: string, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
  } catch {
    /* ignore */
  }
}
