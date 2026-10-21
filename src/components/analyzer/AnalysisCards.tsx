import {
  ArrowDownRight,
  ArrowUpRight,
  Check,
  Crown,
  LineChart,
  Sparkles,
  TrendingDown,
  X,
} from "lucide-react";
import type { AnalysisBullet, PriceInsights } from "@/lib/engine/insights";
import { cn, formatINR } from "@/lib/utils";

/**
 * The three cards under the chart: the numbers, what we make of them, and
 * what we would do about it.
 */
export function AnalysisCards({
  insights,
  bullets,
  recommendation,
  headline,
  sub,
  className,
}: {
  insights: PriceInsights;
  bullets: AnalysisBullet[];
  recommendation: "BUY" | "WAIT" | "AVOID";
  headline: string;
  sub: string;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-4 lg:grid-cols-3", className)}>
      {/* ---------- price insights ---------- */}
      <div className="rounded-2xl border border-hairline bg-card p-5 shadow-card">
        <h3 className="flex items-center gap-2 text-[15px] font-extrabold text-headline">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--dw-green-surface)] text-[var(--dw-green-mid)]">
            <LineChart className="h-4 w-4" />
          </span>
          Price Insights
        </h3>

        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <Insight
            icon={<ArrowUpRight className="h-3.5 w-3.5" />}
            tone="rose"
            label="Highest Price"
            value={insights.highest ? formatINR(insights.highest.price) : "—"}
            note={insights.highest ? fmtDate(insights.highest.at) : undefined}
          />
          <Insight
            icon={<ArrowDownRight className="h-3.5 w-3.5" />}
            tone="emerald"
            label="Lowest Price"
            value={insights.lowest ? formatINR(insights.lowest.price) : "—"}
            note={insights.lowest ? fmtDate(insights.lowest.at) : undefined}
          />
          <Insight
            icon={<LineChart className="h-3.5 w-3.5" />}
            tone="slate"
            label="Average Price"
            value={insights.average ? formatINR(insights.average) : "—"}
            note={insights.median ? `median ${formatINR(insights.median)}` : undefined}
          />
          <Insight
            icon={<TrendingDown className="h-3.5 w-3.5" />}
            tone="amber"
            label="Price Drop"
            value={
              insights.dropFromHighPct !== null ? `${insights.dropFromHighPct}%` : "—"
            }
            note={
              insights.dropFromHighAmount
                ? `${formatINR(insights.dropFromHighAmount)} off the peak`
                : undefined
            }
          />
        </div>
      </div>

      {/* ---------- analysis ---------- */}
      <div className="rounded-2xl border border-hairline bg-card p-5 shadow-card">
        <h3 className="flex items-center gap-2 text-[15px] font-extrabold text-headline">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--dw-green-surface)] text-[var(--dw-green-mid)]">
            <Sparkles className="h-4 w-4" />
          </span>
          DealSense Analysis
        </h3>

        <ul className="mt-4 space-y-2.5">
          {bullets.length === 0 ? (
            <li className="text-[12.5px] text-body">
              We have not recorded enough prices for this product to say anything useful yet.
            </li>
          ) : (
            bullets.map((b, i) => (
              <li key={i} className="flex items-start gap-2">
                <span
                  className={cn(
                    "mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full",
                    b.kind === "GOOD" && "bg-emerald-500/15 text-emerald-600",
                    b.kind === "WARN" && "bg-amber-500/15 text-amber-600",
                    b.kind === "INFO" && "bg-slate-500/15 text-slate-500",
                  )}
                >
                  {b.kind === "GOOD" ? (
                    <Check className="h-2.5 w-2.5" />
                  ) : b.kind === "WARN" ? (
                    <X className="h-2.5 w-2.5" />
                  ) : (
                    <span className="h-1.5 w-1.5 rounded-full bg-current" />
                  )}
                </span>
                <span className="text-[12.5px] leading-snug text-body">{b.text}</span>
              </li>
            ))
          )}
        </ul>
      </div>

      {/* ---------- recommendation ---------- */}
      <div
        className={cn(
          "rounded-2xl p-5 shadow-card",
          recommendation === "BUY" &&
            "border border-emerald-500/30 bg-[linear-gradient(135deg,#064E3B_0%,#065F46_60%,#047857_100%)] text-white",
          recommendation === "WAIT" &&
            "border border-amber-500/30 bg-[linear-gradient(135deg,#78350F_0%,#92400E_100%)] text-white",
          recommendation === "AVOID" &&
            "border border-rose-500/30 bg-[linear-gradient(135deg,#7F1D1D_0%,#991B1B_100%)] text-white",
        )}
      >
        <h3 className="flex items-center gap-2 text-[15px] font-extrabold">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/15">
            <Crown className="h-4 w-4" />
          </span>
          Our Recommendation
        </h3>

        <div className="mt-4 flex items-center gap-4">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-white/12">
            <Crown className="h-7 w-7 text-emerald-300" />
          </span>
          <div className="min-w-0">
            <div className="text-[24px] font-extrabold leading-tight tracking-[-0.02em] text-emerald-300">
              {headline}
            </div>
            <p className="mt-1 text-[12.5px] leading-snug text-white/80">{sub}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Insight({
  icon,
  tone,
  label,
  value,
  note,
}: {
  icon: React.ReactNode;
  tone: "rose" | "emerald" | "slate" | "amber";
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="rounded-xl border border-hairline bg-subtle p-3">
      <div
        className={cn(
          "grid h-7 w-7 place-items-center rounded-lg",
          tone === "rose" && "bg-rose-500/12 text-rose-600",
          tone === "emerald" && "bg-emerald-500/12 text-emerald-600",
          tone === "slate" && "bg-slate-500/12 text-slate-500",
          tone === "amber" && "bg-amber-500/12 text-amber-600",
        )}
      >
        {icon}
      </div>
      <div className="tabular mt-2 text-[15px] font-extrabold leading-none text-headline">
        {value}
      </div>
      <div className="mt-1 text-[10.5px] font-bold text-headline">{label}</div>
      {note ? (
        <div className="mt-0.5 text-[9.5px] font-semibold text-muted">{note}</div>
      ) : null}
    </div>
  );
}

function fmtDate(t: number): string {
  return new Date(t).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
