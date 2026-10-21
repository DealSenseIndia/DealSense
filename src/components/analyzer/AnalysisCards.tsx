import { Check, Crown, Sparkles, X } from "lucide-react";
import type { AnalysisBullet } from "@/lib/engine/insights";
import { cn } from "@/lib/utils";

/**
 * The two cards under the chart: what we make of the history, and what we
 * would do about it. The raw numbers live on the chart itself.
 */
export function AnalysisCards({
  bullets,
  recommendation,
  headline,
  sub,
  className,
}: {
  bullets: AnalysisBullet[];
  recommendation: "BUY" | "WAIT" | "AVOID";
  headline: string;
  sub: string;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-4 lg:grid-cols-[1.35fr_1fr]", className)}>
      {/* ---------- analysis ---------- */}
      <div className="rounded-2xl border border-hairline bg-card p-5 shadow-card">
        <h3 className="flex items-center gap-2 text-[15px] font-extrabold text-headline">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--dw-green-surface)] text-[var(--dw-green-mid)]">
            <Sparkles className="h-4 w-4" />
          </span>
          What the history says
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
          Our recommendation
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
