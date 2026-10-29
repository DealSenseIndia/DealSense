import Link from "next/link";
import { Info, TrendingDown } from "lucide-react";
import { CheckAgeBadge } from "@/components/ui/Badge";
import { Rating } from "@/components/ui/Rating";
import { storageOf } from "@/lib/engine/identity";
import { formatINR } from "@/lib/utils";
import type { CheckInfo } from "@/lib/types";

/** A ring gauge for the DealSense score, out of 100. */
function ScoreGauge({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(1, score / 100));
  const R = 22;
  const CIRC = 2 * Math.PI * R;
  const dash = CIRC * pct;

  return (
    <span className="relative inline-block h-[52px] w-[52px] shrink-0">
      <svg viewBox="0 0 52 52" className="absolute inset-0 h-full w-full -rotate-90">
        <circle
          cx="26"
          cy="26"
          r={R}
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.12"
          strokeWidth="5"
          className="text-slate-500"
        />
        <circle
          cx="26"
          cy="26"
          r={R}
          fill="none"
          stroke="#10b981"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${CIRC}`}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center">
        <span className="tabular text-[15px] font-black leading-none text-headline">
          {Math.round(score)}
        </span>
      </span>
    </span>
  );
}

function scoreLabel(score: number): string {
  if (score >= 85) return "Excellent Deal";
  if (score >= 75) return "Great Deal";
  if (score >= 65) return "Good Deal";
  if (score >= 50) return "Fair Deal";
  return "Not a Deal";
}

/**
 * The strip at the top of a product page: what it is, how the store rates it,
 * and our score. The prices live on the price history chart, not here.
 */
export function ProductHeaderStrip({
  title,
  rating,
  reviewCount,
  brand,
  brandHref,
  category,
  currentPrice,
  mrp,
  score,
  check,
}: {
  title: string;
  rating: number | null;
  reviewCount: number | null;
  brand: string | null;
  /** Set only when the brand has its own page. */
  brandHref?: string | null;
  category: string | null;
  currentPrice: number | null;
  mrp: number | null;
  score: number | null;
  /** When the price was last read successfully. */
  check: CheckInfo;
}) {
  const storage = storageOf(title)[0];
  const model = title.split(" ").slice(0, 3).join(" ");
  const off = mrp && currentPrice ? Math.round(((mrp - currentPrice) / mrp) * 100) : 0;

  const tags = [
    category,
    brand,
    model,
    storage,
    /\b5g\b/i.test(title) ? "5G" : null,
  ].filter(Boolean) as string[];

  // Drop near-duplicates ("Nike" and "Nike Men Running" say the same thing).
  // The brand is never dropped: a store category such as "APPLE Mobiles"
  // would otherwise swallow it, and the brand chip is the link to its page.
  const seen = new Set<string>();
  const cleanTags = tags.filter((t) => {
    const k = t.toLowerCase();
    if (t === brand) {
      seen.add(k);
      return true;
    }
    if (seen.has(k)) return false;
    for (const s of seen) if (k.startsWith(s) || s.startsWith(k)) return false;
    seen.add(k);
    return true;
  });

  return (
    <div className="rounded-2xl border border-hairline bg-card p-4 shadow-card sm:p-5">
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="line-clamp-5 text-[17px] font-extrabold leading-snug tracking-[-0.02em] text-headline sm:line-clamp-none sm:text-[25px] sm:leading-tight">
            {title}
          </h1>

          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <Rating rating={rating} reviewCount={reviewCount} size="md" />
            {currentPrice !== null ? (
              <>
                <span className="tabular text-[19px] font-extrabold leading-none text-[var(--dw-green-mid)]">
                  {formatINR(currentPrice)}
                </span>
                <CheckAgeBadge check={check} />
              </>
            ) : null}
            {currentPrice && mrp && mrp > currentPrice ? (
              <span className="inline-flex items-center gap-1.5 text-[12px] font-bold text-muted">
                <span className="tabular line-through">{formatINR(mrp)}</span>
                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/12 px-1.5 py-0.5 text-[11px] font-extrabold text-[var(--dw-green-mid)]">
                  <TrendingDown className="h-3 w-3" />
                  {off}% OFF
                </span>
              </span>
            ) : null}
          </div>

          {cleanTags.length > 0 ? (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {cleanTags.map((t) =>
                brandHref && t === brand ? (
                  <Link
                    key={t}
                    href={brandHref}
                    className="rounded-full border border-hairline bg-subtle px-2.5 py-1 text-[11px] font-bold text-body transition-colors hover:border-emerald-400/60 hover:text-[var(--dw-green-mid)]"
                  >
                    {t}
                  </Link>
                ) : (
                  <span
                    key={t}
                    className="rounded-full border border-hairline bg-subtle px-2.5 py-1 text-[11px] font-bold text-body"
                  >
                    {t}
                  </span>
                ),
              )}
            </div>
          ) : null}
        </div>

        {score !== null ? (
          <div className="flex shrink-0 items-center gap-3 rounded-2xl border border-hairline bg-subtle px-4 py-3">
            <ScoreGauge score={score} />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-muted">
                  DealSense
                </span>
                <span
                  title="Our score out of 100, from the recorded price history, the landed cost and the market context."
                  className="grid h-3.5 w-3.5 cursor-help place-items-center rounded-full border border-hairline text-muted"
                >
                  <Info className="h-2 w-2" />
                </span>
              </div>
              <div className="mt-0.5 text-[15px] font-extrabold leading-tight text-headline">
                {scoreLabel(score)}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
