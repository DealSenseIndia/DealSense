"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowUpRight, Clock3, RefreshCw, Zap } from "lucide-react";
import { ProductThumb } from "@/components/ui/ProductThumb";
import { cn, formatINR } from "@/lib/utils";
import type { LiveDealCard } from "@/lib/live";

/**
 * The live feed. Re-fetches itself every 45 seconds and re-renders the
 * relative times every 30, so "verified 3m ago" is never a lie. The server
 * only returns prices re-checked in the last 20 minutes.
 */
export function LiveFeed({
  initial = [],
  variant = "page",
  className,
  showHeader = false,
  trackedAge,
  initialResolved = false,
}: {
  initial?: LiveDealCard[];
  variant?: "page" | "rail";
  className?: string;
  /** Render the section heading here, so it can follow the real feed state. */
  showHeader?: boolean;
  /** "last checked 13d ago", computed server-side from the newest store read. */
  trackedAge?: string;
  /** The server already knows the answer; do not show a skeleton first. */
  initialResolved?: boolean;
}) {
  const [deals, setDeals] = useState<LiveDealCard[]>(initial);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(initial.length === 0 && !initialResolved);
  const [now, setNow] = useState(() => Date.now());

  // The heading follows the list, never the other way round: with no rows it
  // says what we are tracking and when it was last checked, with no pulse.
  const header = showHeader ? (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
      <div>
        {deals.length > 0 ? (
          <span className="inline-flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--dw-green-mid)]">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-70" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
            </span>
            Live · verified minutes ago
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-[0.16em] text-muted">
            <span className="inline-flex h-1.5 w-1.5 rounded-full bg-slate-400" />
            Tracked · {trackedAge ?? "last check unknown"}
          </span>
        )}
        <h2 className="mt-1 text-[24px] font-extrabold tracking-[-0.03em] text-headline">
          {deals.length > 0 ? "Drops we just checked" : "Shelves we track"}
        </h2>
        <p className="mt-1 text-[12.5px] text-secondary">
          {deals.length > 0
            ? "At or near their own recorded low, re-read from the store in the last twenty minutes."
            : "No store check in the last twenty minutes, so the live feed is empty. Every tracked price is dated on each card."}
        </p>
      </div>
      <Link
        href="/live"
        className="inline-flex items-center gap-1 text-[11.5px] font-extrabold text-[var(--dw-green-mid)] hover:underline"
      >
        Open the live feed <ArrowUpRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  ) : null;

  useEffect(() => {
    let alive = true;

    async function refresh() {
      try {
        const res = await fetch("/api/live", { cache: "no-store" });
        const data = await res.json();
        if (alive && data.ok) {
          setDeals(data.deals as LiveDealCard[]);
          setUpdatedAt(data.generatedAt as number);
        }
      } catch {
        /* keep the last good list */
      } finally {
        if (alive) setLoading(false);
      }
    }

    refresh();
    const poll = window.setInterval(refresh, 45_000);
    const tick = window.setInterval(() => setNow(Date.now()), 30_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      alive = false;
      window.clearInterval(poll);
      window.clearInterval(tick);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  if (!deals.length) {
    if (loading) {
      const skeleton =
        variant === "rail"
          ? "flex gap-3 overflow-x-auto pb-2"
          : "grid gap-3 sm:grid-cols-2 lg:grid-cols-3";
      return (
        <div className={className}>
          {header}
          <div className={skeleton}>
            {Array.from({ length: variant === "rail" ? 3 : 6 }).map((_, i) => (
            <div
              key={i}
              className={cn(
                "animate-pulse rounded-2xl border border-hairline bg-subtle p-3",
                variant === "rail" && "h-[132px] w-[272px] shrink-0",
              )}
            >
              {variant === "page" ? <div className="h-[108px]" /> : null}
            </div>
            ))}
          </div>
        </div>
      );
    }
    return (
      <div className={className}>
        {header}
        <div className="rounded-2xl border border-dashed border-hairline bg-subtle p-6 text-center">
          <p className="text-[13.5px] font-extrabold text-headline">No verified drops right now</p>
          <p className="mx-auto mt-1 max-w-md text-[12px] leading-relaxed text-secondary">
            This feed only lists prices we re-checked in the last twenty minutes. When something
            falls to its own low, it appears here — and leaves the moment the price moves.
          </p>
          <Link
            href="/deals"
            className="mt-3 inline-flex h-9 items-center rounded-xl border border-hairline bg-card px-4 text-[12px] font-extrabold text-secondary hover:text-headline"
          >
            Browse every tracked deal
          </Link>
        </div>
      </div>
    );
  }

  const list =
    variant === "rail"
      ? "flex gap-3 overflow-x-auto pb-2 [scrollbar-width:none]"
      : "grid gap-3 sm:grid-cols-2 lg:grid-cols-3";

  return (
    <div className={className}>
      {header}
      <div className={list}>
        {deals.map((deal) => (
          <DealCard key={deal.id} deal={deal} now={now} rail={variant === "rail"} />
        ))}
      </div>
      <p className="mt-3 flex items-center gap-1.5 text-[10px] text-muted">
        <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
        Updated {updatedAt ? ago(updatedAt, now) : "just now"} · every card checked within the last
        20 minutes
      </p>
    </div>
  );
}

function DealCard({ deal, now, rail }: { deal: LiveDealCard; now: number; rail: boolean }) {
  const badge = deal.badge === "low" ? "All-time low" : deal.dropPct ? `${deal.dropPct}% under average` : "Below average";
  const countdown = deal.expiresAt ? left(deal.expiresAt, now) : null;
  return (
    <Link
      href={`/product/${deal.slug}`}
      className={cn(
        "group flex flex-col rounded-2xl border border-hairline bg-card p-3 shadow-card transition-colors hover:border-emerald-400/45",
        rail && "w-[272px] shrink-0",
      )}
    >
      <div className="flex items-start gap-2.5">
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-hairline bg-subtle">
          <ProductThumb
            imageUrl={deal.imageUrl}
            alt={deal.title}
            merchant={deal.merchant}
            sizes="64px"
            padding="p-1"
          />
        </div>
        <div className="min-w-0 flex-1">
          <span className="inline-flex items-center gap-0.5 rounded-full bg-[var(--dw-green-surface)] px-1.5 py-0.5 text-[8.5px] font-extrabold uppercase tracking-wider text-[var(--dw-green-mid)]">
            <Zap className="h-2.5 w-2.5" />
            {badge}
          </span>
          <div className="mt-1 line-clamp-2 text-[12.5px] font-semibold leading-snug text-headline">
            {deal.title}
          </div>
          <div className="mt-0.5 text-[10px] text-muted">{deal.merchantName}</div>
        </div>
      </div>
      <div className="mt-2.5 flex items-end justify-between gap-2 border-t border-hairline pt-2">
        <div className="min-w-0">
          <span className="text-[17px] font-extrabold tracking-[-0.01em] text-headline">
            {formatINR(deal.price)}
          </span>
          {deal.avgPrice && deal.avgPrice > deal.price ? (
            <span className="ml-1.5 text-[10.5px] text-muted line-through">
              {formatINR(Math.round(deal.avgPrice))}
            </span>
          ) : null}
        </div>
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1 text-[9.5px] font-semibold",
            countdown ? "text-amber-700 dark:text-amber-300" : "text-muted",
          )}
        >
          <Clock3 className="h-2.5 w-2.5" />
          {countdown ?? `checked ${ago(deal.verifiedAt, now)}`}
        </span>
      </div>
    </Link>
  );
}

function ago(ts: number, now: number): string {
  const s = Math.max(1, Math.floor((now - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function left(expiresAt: number, now: number): string | null {
  const ms = expiresAt - now;
  if (ms <= 0) return null;
  const m = Math.round(ms / 60_000);
  if (m < 60) return `ends in ${m}m`;
  const h = Math.floor(m / 60);
  return `ends in ${h}h ${m % 60}m`;
}
