"use client";

import { useMemo, useState } from "react";
import { Expand, LineChart } from "lucide-react";
import type { PricePoint } from "@/lib/types";
import type { DealEvent } from "@/lib/engine/insights";
import { PriceHistoryChart, type StoreHistory } from "./PriceHistoryChart";
import { cn, formatINR } from "@/lib/utils";

const RANGES = [
  { key: "1M", days: 30 },
  { key: "3M", days: 90 },
  { key: "6M", days: 182 },
  { key: "1Y", days: 365 },
  { key: "2Y", days: 730 },
  { key: "ALL", days: null },
] as const;

type RangeKey = (typeof RANGES)[number]["key"];

export interface ChartStat {
  label: string;
  value: string;
  note?: string;
  tone?: "good" | "muted" | "plain";
}

/**
 * The price history of every store we hold this product in.
 *
 * One store at a time, or all of them together. Every store with a real
 * recorded series gets a button, so you can read how each one moved on its
 * own.
 */
export function PriceHistoryPanel({
  stores,
  events = [],
  stats = [],
  className,
}: {
  stores: StoreHistory[];
  events?: DealEvent[];
  stats?: ChartStat[];
  className?: string;
}) {
  const [range, setRange] = useState<RangeKey>("1Y");
  const [active, setActive] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  /** The stores we actually have a real series for. */
  const usable = useMemo(
    () => stores.filter((s) => s.points.filter((p) => p.price > 0).length > 1),
    [stores],
  );

  /** The points inside the chosen window. */
  const windowed = useMemo(() => {
    const cfg = RANGES.find((r) => r.key === range)!;
    const cut = cfg.days ? Date.now() - cfg.days * 86400000 : 0;
    return usable.map((s) => ({
      ...s,
      points: s.points.filter((p) => p.t >= cut && p.price > 0),
    }));
  }, [usable, range]);

  /** The store the visitor picked, or all of them. */
  const shown = useMemo(
    () => (active ? windowed.filter((s) => s.merchant === active) : windowed),
    [windowed, active],
  );

  const hasData = shown.some((s) => s.points.length > 1);

  return (
    <section
      className={cn(
        "overflow-hidden rounded-2xl border border-hairline bg-card shadow-card",
        className,
      )}
    >
      {/* ---------- header ---------- */}
      <div className="flex flex-wrap items-start justify-between gap-4 px-6 pb-4 pt-5">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--dw-green-surface)] text-[var(--dw-green-mid)]">
            <LineChart className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-[19px] font-extrabold tracking-[-0.02em] text-headline">
              Price history
            </h2>
            <p className="mt-0.5 text-[12.5px] text-muted">
              {shown.length === 1
                ? `${shown[0].name} — every price we recorded. Point anywhere to read that day.`
                : "Every price we recorded, store by store. Point anywhere to read that day."}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-0.5 rounded-xl border border-hairline bg-subtle p-1">
            {RANGES.map((r) => (
              <button
                key={r.key}
                onClick={() => setRange(r.key)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-[12px] font-bold transition-colors",
                  range === r.key
                    ? "bg-emerald-600 text-white shadow-[0_2px_8px_-2px_rgba(5,150,105,0.8)]"
                    : "text-muted hover:bg-elevated hover:text-headline",
                )}
              >
                {r.key}
              </button>
            ))}
          </div>

          <button
            onClick={() => setExpanded((e) => !e)}
            className="grid h-9 w-9 place-items-center rounded-xl border border-hairline bg-subtle text-muted transition-colors hover:text-headline"
            aria-label={expanded ? "Collapse chart" : "Expand chart"}
          >
            <Expand className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ---------- one button per store we hold data for ---------- */}
      {usable.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 border-y border-hairline bg-subtle px-6 py-3">
          <span className="mr-1 text-[10.5px] font-extrabold uppercase tracking-wider text-muted">
            Store
          </span>
          {usable.length > 1 ? (
            <button
              onClick={() => setActive(null)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] font-bold transition-all",
                active === null
                  ? "border-emerald-500/50 bg-[var(--dw-green-surface)] text-[var(--dw-green-bot)]"
                  : "border-hairline bg-card text-body hover:border-emerald-400/60 hover:text-headline",
              )}
            >
              All stores
            </button>
          ) : null}
          {usable.map((s) => {
            const on = active === s.merchant;
            return (
              <button
                key={s.merchant}
                onClick={() => setActive(on ? null : s.merchant)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] font-bold transition-all",
                  on
                    ? "border-emerald-500/50 bg-[var(--dw-green-surface)] text-[var(--dw-green-bot)]"
                    : "border-hairline bg-card text-body hover:border-emerald-400/60 hover:text-headline",
                )}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: s.color }}
                />
                {s.name}
                <span className="tabular text-[10px] font-extrabold text-muted">
                  {s.points.length}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      {/* ---------- the numbers, on the chart ---------- */}
      {stats.length > 0 ? (
        <div className="flex flex-wrap items-center gap-x-8 gap-y-2.5 border-b border-hairline bg-subtle px-6 py-3.5">
          {stats.map((s) => (
            <div key={s.label} className="flex items-baseline gap-2">
              <span className="text-[10.5px] font-extrabold uppercase tracking-wider text-muted">
                {s.label}
              </span>
              <span
                className={cn(
                  "tabular text-[17px] font-extrabold leading-none",
                  s.tone === "good" && "text-[var(--dw-green-mid)]",
                  s.tone === "muted" && "text-muted",
                  s.tone === "plain" && "text-headline",
                )}
              >
                {s.value}
              </span>
              {s.note ? (
                <span className="text-[10.5px] font-semibold text-muted">{s.note}</span>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {/* ---------- the chart ---------- */}
      {hasData ? (
        <div className="px-2 pb-2 pt-1">
          <PriceHistoryChart
            stores={shown}
            height={expanded ? 560 : 380}
          />
        </div>
      ) : (
        <div className="px-6 pb-6 pt-4 text-[12.5px] text-muted">
          We are still collecting prices for this product. Check back soon.
        </div>
      )}
    </section>
  );
}
