"use client";

import { useMemo, useState } from "react";
import { BadgeCheck, Star, ThumbsUp } from "lucide-react";
import type { ReviewRow } from "@/lib/db/queries";
import { cn } from "@/lib/utils";

/** Star distribution, computed from the real reviews we have read. */
function distribution(reviews: ReviewRow[]) {
  const buckets = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: reviews.filter((r) => Math.round(r.stars ?? 0) === star).length,
  }));
  const rated = reviews.filter((r) => r.stars !== null).length;
  return { buckets, rated };
}

function Stars({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5 text-amber-500">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={cn("shrink-0", i <= Math.round(value) ? "fill-amber-500" : "fill-amber-500/20")}
          style={{ width: size, height: size }}
        />
      ))}
    </span>
  );
}

const SORTS = [
  { key: "recent", label: "Most recent" },
  { key: "helpful", label: "Most helpful" },
  { key: "high", label: "Highest rated" },
  { key: "low", label: "Lowest rated" },
] as const;

export function ReviewsPanel({
  reviews,
  storeRating,
  storeReviewCount,
}: {
  reviews: ReviewRow[];
  storeRating: number | null;
  storeReviewCount: number | null;
}) {
  const [sort, setSort] = useState<(typeof SORTS)[number]["key"]>("helpful");
  const [stars, setStars] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);

  const { buckets, rated } = useMemo(() => distribution(reviews), [reviews]);

  /** Only the reviews that match the chosen star rating. */
  const starFiltered = useMemo(
    () => (stars === null ? reviews : reviews.filter((r) => Math.round(r.stars ?? 0) === stars)),
    [reviews, stars],
  );

  const sorted = useMemo(() => {
    const list = [...starFiltered];
    switch (sort) {
      case "recent":
        return list.sort((a, b) => (b.reviewedAt ?? "").localeCompare(a.reviewedAt ?? ""));
      case "high":
        return list.sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0));
      case "low":
        return list.sort((a, b) => (a.stars ?? 0) - (b.stars ?? 0));
      default:
        return list.sort((a, b) => (b.helpful ?? 0) - (a.helpful ?? 0));
    }
  }, [starFiltered, sort]);

  const visible = showAll ? sorted : sorted.slice(0, 6);
  const max = Math.max(1, ...buckets.map((b) => b.count));

  return (
    <section className="overflow-hidden rounded-2xl border border-hairline bg-card shadow-card">
      {/* header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline bg-subtle px-5 py-4">
        <div>
          <h2 className="text-[17px] font-extrabold tracking-tight text-headline">
            Customer reviews
          </h2>
          <p className="mt-0.5 text-[12.5px] text-muted">
            {reviews.length > 0
              ? `${reviews.length} real review${reviews.length === 1 ? "" : "s"} read from the store's own page.`
              : "We have not read the store's reviews for this product yet."}
          </p>
        </div>
        {reviews.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {SORTS.map((s) => (
              <button
                key={s.key}
                onClick={() => setSort(s.key)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-[11.5px] font-bold transition-colors",
                  sort === s.key
                    ? "bg-emerald-500/12 text-[var(--dw-green-mid)] ring-1 ring-emerald-500/30"
                    : "text-muted hover:bg-elevated hover:text-headline",
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ---------- star filter ---------- */}
      {reviews.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-hairline px-5 py-3">
          <span className="text-[11.5px] font-extrabold uppercase tracking-wider text-muted">
            Rating
          </span>
          <button
            onClick={() => setStars(null)}
            className={cn(
              "rounded-lg border px-2.5 py-1 text-[11.5px] font-bold transition-colors",
              stars === null
                ? "border-[var(--dw-green-border)] bg-[var(--dw-green-surface)] text-[var(--dw-green-bot)]"
                : "border-hairline text-muted hover:bg-elevated hover:text-headline",
            )}
          >
            All <span className="tabular text-[10px] font-extrabold">{reviews.length}</span>
          </button>
          {[5, 4, 3, 2, 1].map((s) => {
            const count = reviews.filter((r) => Math.round(r.stars ?? 0) === s).length;
            const on = stars === s;
            return (
              <button
                key={s}
                onClick={() => setStars(on ? null : s)}
                disabled={count === 0}
                className={cn(
                  "inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11.5px] font-bold transition-colors",
                  on
                    ? "border-[var(--dw-green-border)] bg-[var(--dw-green-surface)] text-[var(--dw-green-bot)]"
                    : "border-hairline text-muted hover:bg-elevated hover:text-headline",
                  count === 0 && "cursor-not-allowed opacity-40 hover:bg-transparent hover:text-muted",
                )}
              >
                {s}
                <Star
                  className={cn("h-3 w-3", s >= 4 ? "fill-amber-500 text-amber-500" : "fill-amber-500/30 text-amber-500/30")}
                />
                <span className="tabular text-[10px] font-extrabold">{count}</span>
              </button>
            );
          })}
          {stars !== null ? (
            <span className="ml-auto text-[11.5px] font-bold text-[var(--dw-green-mid)]">
              Showing {starFiltered.length} of {reviews.length} reviews
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-6 p-5 lg:grid-cols-[260px_1fr]">
        {/* ---- score + distribution ---- */}
        <div>
          <div className="flex items-end gap-3">
            <div className="tabular text-[44px] font-black leading-none tracking-tight text-headline">
              {(rated ? reviews.reduce((s, r) => s + (r.stars ?? 0), 0) / rated : storeRating ?? 0).toFixed(1)}
            </div>
            <div className="pb-1.5">
              <Stars value={rated ? reviews.reduce((s, r) => s + (r.stars ?? 0), 0) / rated : storeRating ?? 0} />
              {storeReviewCount ? (
                <div className="mt-1 text-[11.5px] font-semibold text-muted">
                  {storeReviewCount.toLocaleString("en-IN")} ratings on the store
                </div>
              ) : null}
            </div>
          </div>

          {/* the store's own headline number, side by side with ours */}
          {storeRating !== null && rated > 0 ? (
            <p className="mt-3 text-[12px] leading-relaxed text-body">
              The store lists this at{" "}
              <strong className="text-headline">{storeRating.toFixed(1)}★</strong>
              {storeReviewCount ? ` from ${storeReviewCount.toLocaleString("en-IN")} buyers` : ""}. The
              breakdown on the left is from the {rated} individual reviews we read.
            </p>
          ) : null}

          <div className="mt-4 space-y-1.5">
            {buckets.map((b) => (
              <div key={b.star} className="flex items-center gap-2.5">
                <span className="tabular w-7 text-[11.5px] font-bold text-headline">{b.star}★</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-elevated">
                  <div
                    className="h-full rounded-full bg-amber-500 transition-all"
                    style={{ width: `${(b.count / max) * 100}%` }}
                  />
                </div>
                <span className="tabular w-7 text-right text-[11px] font-semibold text-muted">
                  {b.count}
                </span>
              </div>
            ))}
          </div>

          {storeRating !== null && rated > 0 ? (
            <p className="mt-4 border-t border-hairline pt-3 text-[11px] leading-relaxed text-muted">
              We show the store&apos;s rating as the headline number because it covers every buyer.
              The bars are only the reviews we could read.
            </p>
          ) : null}
        </div>

        {/* ---- review cards ---- */}
        <div>
          {visible.length === 0 ? (
            <div className="rounded-xl border border-dashed border-hairline bg-subtle p-10 text-center">
              <p className="text-[13px] font-bold text-headline">
                {stars !== null ? `No ${stars}-star reviews` : "No reviews read yet"}
              </p>
              <p className="mx-auto mt-1.5 max-w-sm text-[12.5px] leading-relaxed text-body">
                {stars !== null
                  ? "Nobody we read rated it that way. Try another rating."
                  : "We only show reviews we actually read off the store's product page. Open this product once and we will pull them."}
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {visible.map((r) => (
                <li
                  key={r.id}
                  className="rounded-xl border border-hairline bg-subtle p-4 transition-colors hover:border-emerald-400/40"
                >
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--dw-green-surface)] text-[11px] font-black text-[var(--dw-green-mid)]">
                      {(r.author ?? "?").trim().charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[12.5px] font-extrabold text-headline">
                          {r.author ?? "Anonymous buyer"}
                        </span>
                        {r.verified ? (
                          <span className="inline-flex items-center gap-1 text-[10.5px] font-bold text-[var(--dw-green-mid)]">
                            <BadgeCheck className="h-3 w-3" /> Verified
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2">
                        <Stars value={r.stars ?? 0} size={12} />
                        {r.reviewedAt ? (
                          <span className="text-[10.5px] font-semibold text-muted">
                            {r.reviewedAt}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    {r.helpful ? (
                      <span className="inline-flex items-center gap-1 text-[10.5px] font-bold text-muted">
                        <ThumbsUp className="h-3 w-3" /> {r.helpful}
                      </span>
                    ) : null}
                  </div>

                  {r.title ? (
                    <h4 className="mt-2.5 text-[13px] font-extrabold text-headline">{r.title}</h4>
                  ) : null}
                  {r.body ? (
                    <p className="mt-1.5 line-clamp-4 text-[12.5px] leading-relaxed text-body">
                      {r.body}
                    </p>
                  ) : null}
                  {r.variant ? (
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {r.variant.split(" · ").map((v, vi) => (
                        <span
                          key={`${v}-${vi}`}
                          className="rounded-md border border-hairline bg-card px-1.5 py-0.5 text-[10px] font-semibold text-muted"
                        >
                          {v}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          {sorted.length > 6 ? (
            <button
              onClick={() => setShowAll((s) => !s)}
              className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-xl border border-hairline bg-card text-[12.5px] font-extrabold text-[var(--dw-green-mid)] transition-colors hover:border-emerald-400/60"
            >
              {showAll ? "Show fewer reviews" : `Show all ${sorted.length} reviews`}
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
