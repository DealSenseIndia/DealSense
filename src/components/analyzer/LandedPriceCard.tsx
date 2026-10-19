"use client";

import { useMemo, useState } from "react";
import { Receipt, Sparkles } from "lucide-react";
import type { LandedPrice, Merchant } from "@/lib/types";
import { offersFor } from "@/lib/engine/bankOffers";
import { computeLandedPrice } from "@/lib/engine/landedPrice";
import { formatINR } from "@/lib/utils";

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
    <div className="rounded-3xl border border-line bg-surface p-6 backdrop-blur-xl">
      <div className="flex items-center gap-2">
        <Receipt className="h-4 w-4 text-brand-400" />
        <h3 className="text-sm font-bold uppercase tracking-wider text-ink-muted">True landed price</h3>
      </div>

      <div className="mt-5 flex items-end justify-between">
        <div>
          <div className="text-xs text-ink-muted">You actually pay</div>
          <div className="tabular text-4xl font-extrabold tracking-tight text-emerald-300">
            {formatINR(landed.effective)}
          </div>
        </div>
        {landed.savings > 0 && (
          <div className="rounded-full border border-emerald-400/40 bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-300">
            Save {formatINR(landed.savings)}
          </div>
        )}
      </div>

      <div className="mt-5 space-y-2.5 border-t border-line pt-5">
        {landed.breakdown.map((row, i) => (
          <div key={i} className="flex items-center justify-between text-sm">
            <span className="text-ink-soft">
              {row.label}
              {row.note && <span className="ml-2 text-xs text-ink-muted">{row.note}</span>}
            </span>
            <span className={`tabular font-semibold ${row.amount < 0 ? "text-emerald-300" : "text-ink"}`}>
              {row.amount < 0 ? "−" : ""}
              {formatINR(Math.abs(row.amount))}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-5">
        <div className="mb-2 flex items-center gap-1.5 text-xs text-ink-muted">
          <Sparkles className="h-3.5 w-3.5" /> Apply a card offer
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSelected(null)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
              selected === null
                ? "border-brand-400/60 bg-brand-500/15 text-brand-200"
                : "border-line text-ink-soft hover:border-line-strong"
            }`}
          >
            Best offer
          </button>
          {offers.map((o) => (
            <button
              key={o.id}
              onClick={() => setSelected(o.id)}
              title={`${o.card} · ${o.label}`}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                selected === o.id
                  ? "border-brand-400/60 bg-brand-500/15 text-brand-200"
                  : "border-line text-ink-soft hover:border-line-strong"
              }`}
            >
              {o.bank}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
