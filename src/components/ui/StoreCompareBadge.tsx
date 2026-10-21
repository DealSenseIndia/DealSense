import { storeMeta } from "@/lib/config";
import { cn, formatINR } from "@/lib/utils";

/**
 * "We track this in 3 stores" — and what buying at the cheapest one saves.
 * Only shown when we really do hold the product on more than one store.
 */
export function StoreCompareBadge({
  stores,
  bestStore,
  saving,
  className,
  compact = false,
}: {
  stores: number;
  bestStore: string | null;
  saving: number;
  className?: string;
  compact?: boolean;
}) {
  if (stores < 2 || !bestStore) return null;
  const best = storeMeta(bestStore);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-[var(--dw-green-border)] bg-[var(--dw-green-surface)] px-2 py-0.5 text-[10px] font-extrabold text-[var(--dw-green-mid)]",
        className,
      )}
      title={`We track this in ${stores} stores. Cheapest right now: ${best.name}.`}
    >
      <svg viewBox="0 0 24 24" className="h-3 w-3 shrink-0" fill="currentColor">
        <path d="M7 3h10l1 5H6l1-5Zm-1 7h12a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Zm2 3v2h2v-2H8Zm6 0v2h2v-2h-2Z" />
      </svg>
      {compact ? (
        <span>{stores} stores</span>
      ) : (
        <span>
          {stores} stores · save {formatINR(saving)} at {best.name}
        </span>
      )}
    </span>
  );
}
