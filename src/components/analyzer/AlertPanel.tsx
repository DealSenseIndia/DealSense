"use client";

import { useState } from "react";
import { Bell, BellRing, Check, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatINR } from "@/lib/utils";

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
    <div className="rounded-3xl border border-line bg-surface p-6 backdrop-blur-xl">
      <div className="flex items-center gap-2">
        <BellRing className="h-4 w-4 text-brand-400" />
        <h3 className="text-sm font-bold uppercase tracking-wider text-ink-muted">Track this price</h3>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setType(t.id)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
              type === t.id
                ? "border-brand-400/60 bg-brand-500/15 text-brand-200"
                : "border-line text-ink-soft hover:border-line-strong"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-5 space-y-4">
        {type === "TARGET_PRICE" && (
          <Field label="Alert me when the price drops to or below">
            <div className="flex items-center gap-2 rounded-xl border border-line bg-surface-raised/50 px-3">
              <span className="text-ink-muted">₹</span>
              <input
                value={target}
                onChange={(e) => setTarget(e.target.value.replace(/[^\d]/g, ""))}
                inputMode="numeric"
                className="tabular h-11 w-full bg-transparent text-lg font-bold text-ink focus:outline-none"
              />
              {currentPrice && <span className="text-xs text-ink-muted">now {formatINR(currentPrice)}</span>}
            </div>
          </Field>
        )}

        {type === "PERCENT_DROP" && (
          <Field label="Alert me when it drops by">
            <div className="flex items-center gap-2 rounded-xl border border-line bg-surface-raised/50 px-3">
              <input
                value={percent}
                onChange={(e) => setPercent(e.target.value.replace(/[^\d]/g, ""))}
                inputMode="numeric"
                className="tabular h-11 w-full bg-transparent text-lg font-bold text-ink focus:outline-none"
              />
              <span className="text-ink-muted">%</span>
            </div>
          </Field>
        )}

        {type === "DEAL_SCORE" && (
          <Field label="Alert me when DealSense scores it above">
            <div className="flex items-center gap-2 rounded-xl border border-line bg-surface-raised/50 px-3">
              <input
                value={score}
                onChange={(e) => setScore(e.target.value.replace(/[^\d]/g, ""))}
                inputMode="numeric"
                className="tabular h-11 w-full bg-transparent text-lg font-bold text-ink focus:outline-none"
              />
              <span className="text-ink-muted">/ 100</span>
            </div>
          </Field>
        )}

        <Field label="Notify me on">
          <div className="flex gap-2">
            {(["telegram", "email"] as const).map((c) => (
              <button
                key={c}
                onClick={() => setChannel(c)}
                className={`flex-1 rounded-xl border px-3 py-2.5 text-sm font-semibold capitalize transition-colors ${
                  channel === c
                    ? "border-brand-400/60 bg-brand-500/15 text-brand-200"
                    : "border-line text-ink-soft hover:border-line-strong"
                }`}
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
              className="h-11 w-full rounded-xl border border-line bg-surface-raised/50 px-3 text-sm text-ink focus:border-brand-400/60 focus:outline-none"
            />
          </Field>
        )}

        {state === "done" ? (
          <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">
            <div className="flex items-center gap-2 font-semibold">
              <Check className="h-4 w-4" /> {message}
            </div>
            {deepLink && (
              <a
                href={deepLink}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-2 rounded-full bg-brand-500 px-4 py-2 text-xs font-bold text-[#04140d]"
              >
                <Send className="h-3.5 w-3.5" /> Connect Telegram to activate
              </a>
            )}
          </div>
        ) : (
          <Button onClick={submit} disabled={state === "loading"} className="w-full" size="lg">
            {state === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
            Set alert
          </Button>
        )}

        {state === "error" && <p className="text-sm text-red-300">{message}</p>}
        <p className="text-[11px] text-ink-muted">
          Tracking {productTitle.slice(0, 60)}
          {productTitle.length > 60 ? "…" : ""}
        </p>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-xs font-medium text-ink-muted">{label}</div>
      {children}
    </div>
  );
}
