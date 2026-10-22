"use client";

import { useMemo, useState } from "react";
import { Receipt, Sparkles } from "lucide-react";
import type { LandedPrice, Merchant } from "@/lib/types";
import { offerDiscount, offersFor } from "@/lib/engine/bankOffers";
import { computeLandedPrice } from "@/lib/engine/landedPrice";
import { cn, formatINR } from "@/lib/utils";

export function LandedPriceCard({
  base,
  shipping,
  merchant,
}: {
  base: number;
  shipping?: number | null;
  merchant: Merchant;
}) {
  const offers = useMemo(() => offersFor(merchant as never), [merchant]);
  // null = no offer applied. Nothing is discounted until the shopper asks for it.
  const [selected, setSelected] = useState<string | null>(null);

  /** The card that gives the most off, and by how much. */
  const { bestId, bestBank, bestDiscount } = useMemo(() => {
    const ranked = offers
      .map((o) => ({ o, d: offerDiscount(o, base) }))
      .filter((x) => x.d > 0)
      .sort((a, b) => b.d - a.d);
    const top = ranked[0];
    return {
      bestId: top?.o.id ?? null,
      bestBank: top?.o.bank ?? "",
      bestDiscount: top?.d ?? 0,
    };
  }, [offers, base]);

  const landed: LandedPrice = useMemo(
    () =>
      computeLandedPrice({
        base,
        shipping,
        merchant: merchant as never,
        selectedOfferId: selected,
        autoBestOffer: false,
      }),
    [base, shipping, merchant, selected],
  );

  return (
    <div className="rounded-2xl border border-hairline bg-card p-5 shadow-card">
      <div className="flex items-center gap-1.5 text-[12px] font-extrabold uppercase tracking-wider text-secondary">
        <Receipt className="h-3.5 w-3.5 text-emerald-accent" />
        What you will pay
      </div>

      <div className="mt-4 flex items-end justify-between gap-3">
        <div>
          <div className="text-[11.5px] font-semibold text-muted">
            {landed.savings > 0 ? "With the offer you pick" : "Price on the store"}
          </div>
          <div className="tabular text-[30px] font-extrabold leading-none tracking-tight text-headline">
            {formatINR(landed.effective)}
          </div>
        </div>
        {landed.savings > 0 ? (
          <div className="rounded-full border border-[var(--dw-green-border)] bg-[var(--dw-green-surface)] px-2.5 py-1 text-[11.5px] font-extrabold text-[var(--dw-green-mid)]">
            Save {formatINR(landed.savings)}
          </div>
        ) : null}
      </div>

      <div className="mt-4 space-y-2 border-t border-hairline pt-4">
        {landed.breakdown.map((row, i) => (
          <div key={i} className="flex items-center justify-between text-[13px]">
            <span className="text-body">
              {row.label}
              {row.note && <span className="ml-1.5 text-[11px] text-muted">{row.note}</span>}
            </span>
            <span
              className={cn(
                "tabular font-extrabold",
                row.amount < 0 ? "text-[var(--dw-green-mid)]" : "text-headline",
              )}
            >
              {row.amount < 0 ? "−" : ""}
              {formatINR(Math.abs(row.amount))}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-4">
        <div className="mb-2 flex items-center gap-1.5 text-[11.5px] font-bold text-muted">
          <Sparkles className="h-3 w-3" /> Apply a card offer
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setSelected(null)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-[11.5px] font-bold transition-colors",
              selected === null
                ? "border-emerald-accent bg-[var(--dw-green-surface)] text-[var(--dw-green-mid)]"
                : "border-hairline text-secondary hover:border-hairline-strong",
            )}
          >
            No offer
          </button>
          {offers.map((o) => {
            const d = offerDiscount(o, base);
            const on = selected === o.id;
            return (
              <button
                key={o.id}
                onClick={() => setSelected(o.id)}
                title={`${o.card} · ${o.label}${d > 0 ? ` — saves ${formatINR(d)}` : " — no discount on this price"}`}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-bold transition-colors",
                  on
                    ? "border-emerald-accent bg-[var(--dw-green-surface)] text-[var(--dw-green-mid)]"
                    : "border-hairline text-secondary hover:border-hairline-strong",
                )}
              >
                {o.bank}
                {d > 0 ? (
                  <span className="tabular text-[10px] font-extrabold text-[var(--dw-green-mid)]">
                    −{formatINR(d)}
                  </span>
                ) : null}
                {bestId === o.id ? (
                  <span className="rounded bg-emerald-500/15 px-1 py-[1px] text-[9px] font-black uppercase tracking-wide text-[var(--dw-green-mid)]">
                    Best
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
        {selected === null ? (
          <p className="mt-2 text-[11px] leading-snug text-muted">
            We do not apply a card offer unless you pick one. The price above is what the store is
            showing.
          </p>
        ) : bestId === selected ? (
          <p className="mt-2 text-[11px] leading-snug text-[var(--dw-green-mid)]">
            That is the best offer we know of for this price — nothing else beats it.
          </p>
        ) : (
          <p className="mt-2 text-[11px] leading-snug text-muted">
            {bestId
              ? `${bestBank} gives more — ${formatINR(bestDiscount)} off instead.`
              : "Pick a card to see what it saves."}
          </p>
        )}
      </div>
    </div>
  );
}
