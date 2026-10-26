"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Check,
  Copy,
  ExternalLink,
  Layers,
  MessageCircle,
  ShieldCheck,
  ShoppingBag,
  X,
} from "lucide-react";
import type { SetupTierResult } from "@/lib/setups/engine";
import { StoreLogo } from "@/components/ui/StoreLogo";
import { formatINR } from "@/lib/utils";

export function SetupBundleModal({
  open,
  onClose,
  tier,
  spaceTitle,
  shareUrl,
}: {
  open: boolean;
  onClose: () => void;
  tier: SetupTierResult;
  spaceTitle: string;
  shareUrl: string;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  const groups = useMemo(() => {
    const map = new Map<string, { merchantName: string; items: SetupTierResult["items"] }>();
    for (const item of tier.items) {
      const g = map.get(item.merchant) ?? { merchantName: item.merchantName, items: [] };
      g.items.push(item);
      map.set(item.merchant, g);
    }
    return [...map.entries()];
  }, [tier.items]);

  if (!open) return null;

  const whatsappText = `${spaceTitle} — ${tier.label} at ${formatINR(tier.totalPrice)}. ${tier.items.length} price-verified picks from DealSense: ${shareUrl}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard denied — the field stays visible and selectable in the footer.
    }
  }

  function openAll() {
    for (const item of tier.items) {
      window.open(item.affiliateUrl, "_blank", "noopener,noreferrer,sponsored");
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="bundle-title"
      className="fixed inset-0 z-[70] grid place-items-end bg-slate-950/55 p-0 backdrop-blur-sm sm:place-items-center sm:p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[26px] border border-hairline bg-card shadow-pop sm:rounded-[26px]">
        <div className="flex items-start justify-between gap-4 border-b border-hairline px-5 py-4 sm:px-6">
          <div>
            <span className="inline-flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-[0.14em] text-[var(--dw-green-mid)]">
              <ShoppingBag className="h-3.5 w-3.5" /> Multi-store bundle
            </span>
            <h3 id="bundle-title" className="mt-1 text-lg font-extrabold tracking-[-0.02em] text-headline">
              {spaceTitle} · {tier.label}
            </h3>
            <p className="mt-0.5 text-[11.5px] text-secondary">
              {tier.items.length} picks across {groups.length} {groups.length === 1 ? "store" : "stores"}.
              Each link is tracked and affiliated.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close bundle"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-hairline text-secondary transition-colors hover:bg-elevated hover:text-headline"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-3 divide-x divide-hairline border-b border-hairline bg-subtle">
          <Stat label="Total" value={formatINR(tier.totalPrice)} accent />
          <Stat label="Listed MRP" value={tier.totalMrp ? formatINR(tier.totalMrp) : "—"} />
          <Stat
            label="Below MRP"
            value={tier.savingsVsMrp ? formatINR(tier.savingsVsMrp) : "—"}
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
          {groups.map(([merchant, group]) => (
            <div key={merchant} className="mb-5 last:mb-0">
              <div className="mb-2 flex items-center gap-2">
                <StoreLogo merchant={merchant} size={18} />
                <span className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-secondary">
                  {group.merchantName}
                </span>
                <span className="tabular rounded-full border border-hairline bg-elevated px-2 py-0.5 text-[9.5px] font-bold text-muted">
                  {group.items.length} {group.items.length === 1 ? "item" : "items"}
                </span>
              </div>
              <ul className="overflow-hidden rounded-xl border border-hairline">
                {group.items.map((item) => (
                  <li
                    key={item.listingId}
                    className="flex items-center gap-3 border-b border-hairline-soft px-3 py-2.5 last:border-b-0"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-[9px] font-extrabold uppercase tracking-[0.1em] text-muted">
                        {item.slotLabel}
                      </span>
                      <a
                        href={item.affiliateUrl}
                        target="_blank"
                        rel="noopener noreferrer sponsored"
                        className="mt-0.5 line-clamp-2 text-[12px] font-bold leading-snug text-headline hover:text-[var(--dw-green-mid)]"
                      >
                        {item.title}
                      </a>
                    </span>
                    <span className="tabular shrink-0 text-[12px] font-extrabold text-headline">
                      {formatINR(item.price)}
                    </span>
                    <a
                      href={item.affiliateUrl}
                      target="_blank"
                      rel="noopener noreferrer sponsored"
                      aria-label={`Open ${item.slotLabel}`}
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-hairline text-secondary transition-colors hover:border-emerald-400/50 hover:text-[var(--dw-green-mid)]"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div className="mt-4 flex items-start gap-2 rounded-xl border border-emerald-400/25 bg-[var(--dw-green-surface)] p-3 text-[10.5px] leading-relaxed text-secondary">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--dw-green-mid)]" />
            <p>
              Prices are the last values we recorded from the stores, not live checkout quotes.
              Confirm the final price, seller and delivery date on the store page. Bank or exchange
              offers never enter these totals.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-hairline bg-card px-5 py-4 sm:flex-row sm:items-center sm:px-6">
          <button
            type="button"
            onClick={openAll}
            className="btn-cta inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-btn px-4 text-[12px] font-extrabold"
          >
            <Layers className="h-4 w-4" />
            Open all {tier.items.length} store links
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={copyLink}
              className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-btn border border-hairline px-3 text-[11.5px] font-bold text-secondary transition-colors hover:bg-elevated hover:text-headline sm:flex-none"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-[var(--dw-green-mid)]" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy link"}
            </button>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(whatsappText)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-btn border border-hairline px-3 text-[11.5px] font-bold text-secondary transition-colors hover:bg-elevated hover:text-headline sm:flex-none"
            >
              <MessageCircle className="h-3.5 w-3.5" />
              Share
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="px-3 py-3 text-center">
      <div className="text-[9px] font-extrabold uppercase tracking-[0.1em] text-muted">{label}</div>
      <div
        className={`tabular mt-0.5 text-[14px] font-extrabold ${
          accent ? "text-[var(--dw-green-mid)]" : "text-headline"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
