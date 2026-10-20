import { cn } from "@/lib/utils";
import type { Confidence, Freshness, Verdict } from "@/lib/types";
import { storeMeta } from "@/lib/config";

export function Pill({
  children,
  className,
  tone = "neutral",
}: {
  children: React.ReactNode;
  className?: string;
  tone?: "neutral" | "brand" | "amber" | "blue" | "red" | "violet";
}) {
  const tones = {
    neutral: "border-hairline text-secondary bg-card",
    brand: "border-[var(--dw-green-border)] text-[var(--dw-green-mid)] bg-[var(--dw-green-surface)]",
    amber: "border-amber-400/40 text-amber-600 bg-amber-50 dark:text-amber-300 dark:bg-amber-500/10",
    blue: "border-sky-400/40 text-sky-600 bg-sky-50 dark:text-sky-300 dark:bg-sky-500/10",
    red: "border-red-400/40 text-red-600 bg-red-50 dark:text-red-300 dark:bg-red-500/10",
    violet: "border-teal-400/40 text-teal-600 bg-teal-50 dark:text-teal-300 dark:bg-teal-500/10",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold tracking-tight",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function StoreBadge({
  merchant,
  className,
  showName = true,
}: {
  merchant: string;
  className?: string;
  showName?: boolean;
}) {
  const m = storeMeta(merchant);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-extrabold text-white",
        className,
      )}
      style={{ background: m.color }}
    >
      <span className="text-[9.5px]">{m.short}</span>
      {showName && <span className="hidden sm:inline">{m.name}</span>}
    </span>
  );
}

const verdictTone: Record<Verdict, string> = {
  BUY: "border-[var(--dw-green-border)] bg-[var(--dw-green-surface)] text-[var(--verdict-buy)]",
  FAIR: "border-sky-400/40 bg-sky-500/10 text-[var(--verdict-fair)]",
  WAIT: "border-amber-400/40 bg-amber-500/10 text-[var(--verdict-wait)]",
  AVOID: "border-red-400/40 bg-red-500/10 text-[var(--verdict-avoid)]",
  INSUFFICIENT: "border-hairline bg-elevated text-secondary",
};

const verdictText: Record<Verdict, string> = {
  BUY: "🔥 Buy Now",
  FAIR: "🙂 Fair Price",
  WAIT: "⏳ Wait",
  AVOID: "🚫 Avoid",
  INSUFFICIENT: "🕐 Building history",
};

export function VerdictBadge({ verdict, className }: { verdict: Verdict; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11.5px] font-extrabold",
        verdictTone[verdict],
        className,
      )}
    >
      {verdictText[verdict]}
    </span>
  );
}

export function FreshnessBadge({ freshness, ts }: { freshness: Freshness; ts?: number | null }) {
  const map: Record<Freshness, { cls: string; label: string; dot: string }> = {
    LIVE: { cls: "border-[var(--dw-green-border)] bg-[var(--dw-green-surface)] text-[var(--dw-green-mid)]", label: "Live", dot: "bg-emerald-500" },
    OBSERVED: { cls: "border-sky-400/40 bg-sky-500/10 text-sky-600 dark:text-sky-300", label: "Observed", dot: "bg-sky-500" },
    STALE: { cls: "border-amber-400/40 bg-amber-500/10 text-amber-600 dark:text-amber-300", label: "Stale", dot: "bg-amber-500" },
    EXPIRED: { cls: "border-red-400/40 bg-red-500/10 text-red-600 dark:text-red-300", label: "Expired", dot: "bg-red-500" },
    UNKNOWN: { cls: "border-hairline bg-elevated text-secondary", label: "Recorded", dot: "bg-slate-400" },
  };
  const m = map[freshness];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10.5px] font-bold", m.cls)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", m.dot, freshness === "LIVE" && "animate-pulse-ring")} />
      {m.label}
      {ts ? (
        <span className="font-medium text-muted">
          · {new Date(ts).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
        </span>
      ) : null}
    </span>
  );
}

/** Small tag used on stat tiles and cards ("Verified", "Benchmark", "90D"). */
export function Tag({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: "neutral" | "brand" | "amber" | "blue" | "red";
  className?: string;
}) {
  const tones = {
    neutral: "border-hairline bg-subtle text-secondary",
    brand: "border-[var(--dw-green-border)] bg-[var(--dw-green-surface)] text-[var(--dw-green-mid)]",
    amber: "border-amber-400/40 bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
    blue: "border-sky-400/40 bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300",
    red: "border-red-400/40 bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300",
  };
  return (
    <span className={cn("rounded-md border px-1.5 py-0.5 text-[10px] font-bold", tones[tone], className)}>
      {children}
    </span>
  );
}

export function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  const map: Record<Confidence, string> = {
    HIGH: "text-[var(--verdict-buy)]",
    MEDIUM: "text-[var(--verdict-fair)]",
    LOW: "text-[var(--verdict-wait)]",
    INSUFFICIENT: "text-muted",
  };
  return (
    <span className={cn("text-[10.5px] font-extrabold uppercase tracking-wider", map[confidence])}>
      {confidence} confidence
    </span>
  );
}
