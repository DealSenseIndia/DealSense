"use client";

import { useState } from "react";
import { Bell, BellRing, Check, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn, formatINR } from "@/lib/utils";

type AlertType = "TARGET_PRICE" | "PERCENT_DROP" | "DEAL_SCORE";

export function AlertPanel({
  productId,
  listingId,
  currentPrice,
  productTitle,
}: {
  productId: string;
  listingId: string;
  currentPrice: number | null;
  productTitle: string;
}) {
  const [type, setType] = useState<AlertType>("TARGET_PRICE");
  const [target, setTarget] = useState(currentPrice ? String(Math.round(currentPrice * 0.9)) : "");
  const [percent, setPercent] = useState("10");
  const [score, setScore] = useState("80");
  const [channel, setChannel] = useState<"telegram" | "email">("telegram");
  const [contact, setContact] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  const [deepLink, setDeepLink] = useState<string | null>(null);

  async function submit() {
    setState("loading");
    setMessage("");
    try {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          listingId,
          alertType: type,
          targetPrice: type === "TARGET_PRICE" ? Number(target) : undefined,
          baselinePrice: currentPrice ?? undefined,
          targetPercent: type === "PERCENT_DROP" ? Number(percent) : undefined,
          targetScore: type === "DEAL_SCORE" ? Number(score) : undefined,
          channel,
          contact: contact || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setState("error");
        setMessage(data.error || "Could not create the alert.");
        return;
      }
      setState("done");
      setMessage("Alert armed. We'll notify you the moment it triggers.");
      const bot = process.env.NEXT_PUBLIC_TELEGRAM_BOT;
      if (channel === "telegram" && bot) {
        setDeepLink(`https://t.me/${bot}?start=alert_${data.alert.id}`);
      }
    } catch {
      setState("error");
      setMessage("Network error. Try again.");
    }
  }

  const tabs: { id: AlertType; label: string }[] = [
    { id: "TARGET_PRICE", label: "Target price" },
    { id: "PERCENT_DROP", label: "% drop" },
    { id: "DEAL_SCORE", label: "Deal score" },
  ];

  return (
    <div className="rounded-2xl border border-hairline bg-card p-4 shadow-card">
      <div className="flex items-center gap-1.5 text-[12px] font-extrabold uppercase tracking-wider text-secondary">
        <BellRing className="h-3.5 w-3.5 text-emerald-accent" />
        Price drop alert
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setType(t.id)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-[11.5px] font-bold transition-colors",
              type === t.id
                ? "border-emerald-accent bg-[var(--dw-green-surface)] text-[var(--dw-green-mid)]"
                : "border-hairline text-secondary hover:border-hairline-strong",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-3.5">
        {type === "TARGET_PRICE" && (
          <Field label="Alert me when the price drops to or below">
            <div className="flex items-center gap-2 rounded-xl border border-hairline bg-subtle px-3">
              <span className="text-[13px] text-muted">₹</span>
              <input
                value={target}
                onChange={(e) => setTarget(e.target.value.replace(/[^\d]/g, ""))}
                inputMode="numeric"
                className="tabular h-10 w-full bg-transparent text-[16px] font-extrabold text-headline focus:outline-none"
              />
              {currentPrice && (
                <span className="text-[11px] font-semibold text-muted">now {formatINR(currentPrice)}</span>
              )}
            </div>
          </Field>
        )}

        {type === "PERCENT_DROP" && (
          <Field label="Alert me when it drops by">
            <div className="flex items-center gap-2 rounded-xl border border-hairline bg-subtle px-3">
              <input
                value={percent}
                onChange={(e) => setPercent(e.target.value.replace(/[^\d]/g, ""))}
                inputMode="numeric"
                className="tabular h-10 w-full bg-transparent text-[16px] font-extrabold text-headline focus:outline-none"
              />
              <span className="text-[13px] text-muted">%</span>
            </div>
          </Field>
        )}

        {type === "DEAL_SCORE" && (
          <Field label="Alert me when DealSense scores it above">
            <div className="flex items-center gap-2 rounded-xl border border-hairline bg-subtle px-3">
              <input
                value={score}
                onChange={(e) => setScore(e.target.value.replace(/[^\d]/g, ""))}
                inputMode="numeric"
                className="tabular h-10 w-full bg-transparent text-[16px] font-extrabold text-headline focus:outline-none"
              />
              <span className="text-[13px] text-muted">/ 100</span>
            </div>
          </Field>
        )}

        <Field label="Notify me on">
          <div className="flex gap-1.5">
            {(["telegram", "email"] as const).map((c) => (
              <button
                key={c}
                onClick={() => setChannel(c)}
                className={cn(
                  "flex-1 rounded-xl border px-3 py-2 text-[12.5px] font-bold capitalize transition-colors",
                  channel === c
                    ? "border-emerald-accent bg-[var(--dw-green-surface)] text-[var(--dw-green-mid)]"
                    : "border-hairline text-secondary hover:border-hairline-strong",
                )}
              >
                {c}
              </button>
            ))}
          </div>
        </Field>

        {channel === "email" && (
          <Field label="Your email">
            <input
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="you@example.com"
              className="h-10 w-full rounded-xl border border-hairline bg-subtle px-3 text-[13px] text-headline focus:border-emerald-accent/50 focus:outline-none"
            />
          </Field>
        )}

        {state === "done" ? (
          <div className="rounded-xl border border-[var(--dw-green-border)] bg-[var(--dw-green-surface)] p-3 text-[12.5px] font-bold text-[var(--dw-green-mid)]">
            <div className="flex items-center gap-1.5">
              <Check className="h-3.5 w-3.5" /> {message}
            </div>
            {deepLink && (
              <a
                href={deepLink}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-emerald-accent px-3.5 py-1.5 text-[11.5px] font-extrabold text-white"
              >
                <Send className="h-3 w-3" /> Connect Telegram to activate
              </a>
            )}
          </div>
        ) : (
          <Button onClick={submit} disabled={state === "loading"} className="w-full">
            {state === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
            Set alert
          </Button>
        )}

        {state === "error" && <p className="text-[12.5px] font-semibold text-[var(--verdict-avoid)]">{message}</p>}
        <p className="text-[10.5px] font-semibold leading-snug text-muted">
          Tracking {productTitle.slice(0, 70)}
          {productTitle.length > 70 ? "…" : ""}
        </p>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-[11.5px] font-bold text-muted">{label}</div>
      {children}
    </div>
  );
}
