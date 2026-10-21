import Image from "next/image";
import { Crown, Info, TrendingDown } from "lucide-react";
import { Rating } from "@/components/ui/Rating";
import { ProductThumb } from "@/components/ui/ProductThumb";
import { storageOf } from "@/lib/engine/identity";
import { cn, formatINR } from "@/lib/utils";

/** A small arc gauge for the DealSense score. */
function ScoreGauge({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(1, score / 10));
  const R = 24;
  const CIRC = Math.PI * R; // half circle
  const dash = CIRC * pct;

  return (
    <span className="relative inline-block h-[54px] w-[60px] shrink-0">
      <svg viewBox="0 0 60 54" className="absolute inset-0 h-full w-full">
        <path
          d={`M 6 48 A ${R} ${R} 0 0 1 54 48`}
          fill="none"
          stroke="rgba(255,255,255,0.16)"
          strokeWidth="5.5"
          strokeLinecap="round"
        />
        <path
          d={`M 6 48 A ${R} ${R} 0 0 1 54 48`}
          fill="none"
          stroke="#34d399"
          strokeWidth="5.5"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${CIRC}`}
        />
      </svg>
      <span className="absolute inset-x-0 bottom-0 text-center">
        <span className="tabular block text-[15px] font-black leading-none text-white">
          {score.toFixed(1)}
        </span>
        <span className="block text-[8px] font-bold leading-none text-slate-400">/10</span>
      </span>
    </span>
  );
}

function scoreLabel(score: number): string {
  if (score >= 8.5) return "Excellent Deal";
  if (score >= 7.5) return "Great Deal";
  if (score >= 6.5) return "Good Deal";
  if (score >= 5) return "Fair Deal";
  return "Not a Deal";
}

/**
 * The strip at the top of a product page: what it is, how the store rates it,
 * the lowest we ever saw it, what it costs now, and our score.
 */
export function ProductHeaderStrip({
  title,
  imageUrl,
  merchant,
  rating,
  reviewCount,
  brand,
  category,
  currentPrice,
  mrp,
  lowest,
  lowestAt,
  score,
  onLowestClick,
}: {
  title: string;
  imageUrl: string | null;
  merchant: string;
  rating: number | null;
  reviewCount: number | null;
  brand: string | null;
  category: string | null;
  currentPrice: number | null;
  mrp: number | null;
  lowest: { price: number; at: number } | null;
  lowestAt?: number | null;
  score: number | null;
  onLowestClick?: () => void;
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

  return (
    <div className="rounded-2xl border border-hairline bg-card p-4 shadow-card sm:p-5">
      <div className="flex items-start gap-4">
        {/* image */}
        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl border border-hairline bg-subtle sm:h-28 sm:w-28">
          <ProductThumb
            imageUrl={imageUrl}
            alt={title}
            merchant={merchant}
            sizes="112px"
            padding="p-2"
          />
        </div>

        {/* title + rating + tags */}
        <div className="min-w-0 flex-1">
          <h1 className="text-[19px] font-extrabold leading-tight tracking-[-0.02em] text-headline sm:text-[25px]">
            {title}
          </h1>

          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            <Rating rating={rating} reviewCount={reviewCount} size="md" />
          </div>

          {tags.length > 0 ? (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {tags.map((t) => (
                <span
                  key={t}
                  className="rounded-full border border-hairline bg-subtle px-2.5 py-1 text-[11px] font-bold text-body"
                >
                  {t}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {/* ---------- the three numbers ---------- */}
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {/* lowest ever */}
        {lowest ? (
          <button
            onClick={onLowestClick}
            className="flex items-center gap-3 rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.07] px-4 py-3 text-left transition-colors hover:border-emerald-500/50"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-500/15 text-emerald-600">
              <Crown className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block text-[11px] font-extrabold text-emerald-700 dark:text-emerald-400">
                Lowest Price Ever
              </span>
              <span className="tabular block text-[19px] font-extrabold leading-tight text-headline">
                {formatINR(lowest.price)}
              </span>
              <span className="block text-[10.5px] font-semibold text-muted">
                on{" "}
                {new Date(lowestAt ?? lowest.at).toLocaleDateString("en-IN", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}
              </span>
            </span>
          </button>
        ) : (
          <div />
        )}

        {/* current price */}
        {currentPrice ? (
          <div className="rounded-2xl border border-hairline bg-subtle px-4 py-3">
            <div className="text-[11px] font-extrabold uppercase tracking-wider text-muted">
              Current Price
            </div>
            <div className="mt-1 flex flex-wrap items-baseline gap-2">
              <span className="tabular text-[24px] font-extrabold leading-none text-headline">
                {formatINR(currentPrice)}
              </span>
              {mrp && mrp > currentPrice ? (
                <span className="tabular text-[12.5px] font-semibold text-muted line-through">
                  {formatINR(mrp)}
                </span>
              ) : null}
            </div>
            {off > 0 ? (
              <span className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-emerald-500/12 px-2 py-1 text-[11px] font-extrabold text-[var(--dw-green-mid)]">
                <TrendingDown className="h-3 w-3" />
                {off}% OFF
              </span>
            ) : null}
          </div>
        ) : (
          <div />
        )}

        {/* score */}
        {score !== null ? (
          <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/30 bg-[#061A12] px-4 py-3">
            <ScoreGauge score={score} />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-400">
                  DealSense Score
                </span>
                <span
                  title="Our score out of 10, from the recorded price history, the landed cost and the market context."
                  className="grid h-3.5 w-3.5 cursor-help place-items-center rounded-full border border-white/20 text-slate-400"
                >
                  <Info className="h-2 w-2" />
                </span>
              </div>
              <div className="mt-1 text-[15px] font-extrabold leading-tight text-white">
                {scoreLabel(score)}
              </div>
            </div>
          </div>
        ) : (
          <div />
        )}
      </div>
    </div>
  );
}
