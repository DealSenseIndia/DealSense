/**
 * Register the Telegram webhook for price-drop alerts.
 *
 *   npx tsx scripts/telegram-setup.ts
 *
 * Reads TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET and NEXT_PUBLIC_SITE_URL
 * from .env.local. Prints the bot's public username, the webhook URL and
 * Telegram's reply — never the token or the secret.
 */
import "./env";

const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
const site = (process.env.NEXT_PUBLIC_SITE_URL || "https://dealsense-fawn.vercel.app").replace(/\/$/, "");

async function call(method: string, body?: unknown) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json() as Promise<{ ok: boolean; result?: unknown; description?: string }>;
}

(async () => {
  if (!token) {
    console.error("TELEGRAM_BOT_TOKEN is empty in .env.local — create the bot with @BotFather first.");
    process.exit(1);
  }
  if (!secret) {
    console.error("TELEGRAM_WEBHOOK_SECRET is empty — set any long random string, then re-run.");
    process.exit(1);
  }

  const me = await call("getMe");
  if (!me.ok) {
    console.error("Telegram rejected the token:", me.description);
    process.exit(1);
  }
  const username = (me.result as { username?: string })?.username ?? "(unknown)";

  const hook = `${site}/api/telegram/webhook`;
  const set = await call("setWebhook", {
    url: hook,
    secret_token: secret,
    allowed_updates: ["message", "edited_message"],
    drop_pending_updates: true,
  });
  if (!set.ok) {
    console.error("setWebhook failed:", set.description);
    process.exit(1);
  }

  const info = await call("getWebhookInfo");
  const i = info.result as { url?: string; pending_update_count?: number; last_error_message?: string };
  console.log(`bot: @${username}`);
  console.log(`webhook: ${i.url}`);
  console.log(`pending updates: ${i.pending_update_count ?? 0}`);
  if (i.last_error_message) console.log(`last error: ${i.last_error_message}`);
  console.log(`deep link: https://t.me/${username}?start=alert_<id>`);
  process.exit(0);
})();
