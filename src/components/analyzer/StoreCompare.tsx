"use client";

import { ExternalLink } from "lucide-react";
import type { AnalysisResult } from "@/lib/types";
import { storeMeta } from "@/lib/config";
import { formatINR, timeAgo } from "@/lib/utils";
import { ButtonLink } from "@/components/ui/Button";

export function StoreCompare({
  listing,
  rival,
  landedEffective,
}: {
  listing: NonNullable<AnalysisResult["listing"]>;
  rival: AnalysisResult["rival"];
  landedEffective: number | null;
}) {
  const primaryMeta = storeMeta(listing.merchant);

  return (
    <div className="rounded-3xl border border-line bg-surface p-6 backdrop-blur-xl">
      <h3 className="text-sm font-bold uppercase tracking-wider text-ink-muted">Store comparison</h3>

      <div className="mt-5 space-y-3">
        <Row
          merchant={listing.merchant}
          price={listing.price}
          effective={landedEffective}
          checkedAt={listing.lastCheckedAt}
          url={listing.affiliateUrl}
          primary
        />
        {rival ? (
          <Row
            merchant={rival.merchant}
            price={rival.price}
            effective={rival.effectivePrice}
            checkedAt={rival.lastCheckedAt}
            url={rival.affiliateUrl}
          />
        ) : (
          <div className="rounded-2xl border border-dashed border-line p-4 text-sm text-ink-muted">
            No verified {listing.merchant === "amazon" ? "Flipkart" : "Amazon"} match found yet.
            DealSense only compares identical variants.
          </div>
        )}
      </div>
    </div>
  );
}

function Row({
  merchant,
  price,
  effective,
  checkedAt,
  url,
  primary = false,
}: {
  merchant: string;
  price: number | null;
  effective: number | null;
  checkedAt: number | null;
  url: string;
  primary?: boolean;
}) {
  const meta = storeMeta(merchant);
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-line bg-surface-raised/40 p-4">
      <span
        className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-xs font-extrabold text-white"
        style={{ background: meta.color }}
      >
        {meta.short}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-semibold">{meta.name}</span>
          {primary && (
            <span className="rounded-full border border-brand-400/40 bg-brand-500/10 px-2 py-0.5 text-[10px] font-bold uppercase text-brand-300">
              This listing
            </span>
          )}
        </div>
        <div className="text-xs text-ink-muted">
          {checkedAt ? `Verified ${timeAgo(checkedAt)}` : "Awaiting verification"}
        </div>
      </div>
      <div className="text-right">
        <div className="tabular text-lg font-bold">{formatINR(price)}</div>
        {effective !== null && effective !== price && (
          <div className="tabular text-xs text-emerald-300">→ {formatINR(effective)} landed</div>
        )}
      </div>
      <ButtonLink href={url} size="sm" variant={primary ? "primary" : "outline"} className="shrink-0">
        Buy <ExternalLink className="h-3.5 w-3.5" />
      </ButtonLink>
    </div>
  );
}
