import { cn } from "@/lib/utils";
import type { Confidence, Freshness, Verdict } from "@/lib/types";

export function Pill({
  children,
  className,
  tone = "neutral",
}: {
  children: React.ReactNode;
  className?: string;
  tone?: "neutral" | "brand" | "amber" | "blue" | "red";
}) {
  const tones = {
    neutral: "border-line-strong text-ink-soft",
    brand: "border-brand-400/40 text-brand-300 bg-brand-500/10",
    amber: "border-amber-400/40 text-amber-300 bg-amber-500/10",
    blue: "border-sky-400/40 text-sky-300 bg-sky-500/10",
    red: "border-red-400/40 text-red-300 bg-red-500/10",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-wide",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const verdictTone: Record<Verdict, string> = {
  BUY: "border-emerald-400/50 bg-emerald-500/15 text-emerald-300",
  FAIR: "border-sky-400/50 bg-sky-500/15 text-sky-300",
  WAIT: "border-amber-400/50 bg-amber-500/15 text-amber-300",
  AVOID: "border-red-400/50 bg-red-500/15 text-red-300",
  INSUFFICIENT: "border-slate-400/40 bg-slate-500/10 text-slate-300",
};

export function VerdictBadge({ verdict, className }: { verdict: Verdict; className?: string }) {
  const labels: Record<Verdict, string> = {
    BUY: "🔥 Buy now",
    FAIR: "🙂 Fair price",
    WAIT: "⏳ Wait",
    AVOID: "🚫 Avoid",
    INSUFFICIENT: "🕐 Not enough data",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold tracking-wide",
        verdictTone[verdict],
        className,
      )}
    >
      {labels[verdict]}
    </span>
  );
}

export function FreshnessBadge({ freshness, ts }: { freshness: Freshness; ts?: number | null }) {
  const map: Record<Freshness, { cls: string; label: string; dot: string }> = {
    LIVE: { cls: "text-emerald-300 border-emerald-400/40 bg-emerald-500/10", label: "Live", dot: "bg-emerald-400" },
    OBSERVED: { cls: "text-sky-300 border-sky-400/40 bg-sky-500/10", label: "Observed", dot: "bg-sky-400" },
    STALE: { cls: "text-amber-300 border-amber-400/40 bg-amber-500/10", label: "Stale", dot: "bg-amber-400" },
    EXPIRED: { cls: "text-red-300 border-red-400/40 bg-red-500/10", label: "Expired", dot: "bg-red-400" },
    UNKNOWN: { cls: "text-ink-muted border-line-strong", label: "No data", dot: "bg-slate-500" },
  };
  const m = map[freshness];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold", m.cls)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", m.dot, freshness === "LIVE" && "animate-pulse-glow")} />
      {m.label}
      {ts ? <span className="text-ink-muted font-normal">· {new Date(ts).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span> : null}
    </span>
  );
}

export function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  const map: Record<Confidence, string> = {
    HIGH: "text-emerald-300",
    MEDIUM: "text-sky-300",
    LOW: "text-amber-300",
    INSUFFICIENT: "text-ink-muted",
  };
  return (
    <span className={cn("text-[11px] font-semibold uppercase tracking-wider", map[confidence])}>
      {confidence} confidence
    </span>
  );
}
