"use client";

import { useMemo, useState } from "react";
import { Receipt, Sparkles } from "lucide-react";
import type { LandedPrice, Merchant } from "@/lib/types";
import { offersFor } from "@/lib/engine/bankOffers";
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
  const [selected, setSelected] = useState<string | null>(null);

  const landed: LandedPrice = useMemo(
    () =>
      computeLandedPrice({
        base,
        shipping,
        merchant: merchant as never,
        selectedOfferId: selected,
      }),
    [base, shipping, merchant, selected],
  );

  return (
    <div className="rounded-2xl border border-hairline bg-card p-5 shadow-card">
      <div className="flex items-center gap-1.5 text-[12px] font-extrabold uppercase tracking-wider text-secondary">
        <Receipt className="h-3.5 w-3.5 text-emerald-accent" />
        True landed price
      </div>

      <div className="mt-4 flex items-end justify-between">
        <div>
          <div className="text-[11.5px] font-semibold text-muted">You actually pay</div>
          <div className="tabular text-[32px] font-extrabold leading-none tracking-tight text-[var(--dw-green-mid)]">
            {formatINR(landed.effective)}
          </div>
        </div>
        {landed.savings > 0 && (
          <div className="rounded-full border border-[var(--dw-green-border)] bg-[var(--dw-green-surface)] px-2.5 py-1 text-[11.5px] font-extrabold text-[var(--dw-green-mid)]">
            Save {formatINR(landed.savings)}
          </div>
        )}
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
            Best offer
          </button>
          {offers.map((o) => (
            <button
              key={o.id}
              onClick={() => setSelected(o.id)}
              title={`${o.card} · ${o.label}`}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[11.5px] font-bold transition-colors",
                selected === o.id
                  ? "border-emerald-accent bg-[var(--dw-green-surface)] text-[var(--dw-green-mid)]"
                  : "border-hairline text-secondary hover:border-hairline-strong",
              )}
            >
              {o.bank}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
