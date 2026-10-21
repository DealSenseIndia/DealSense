import { cn } from "@/lib/utils";

/** The store's own rating, drawn as stars. Only ever real numbers. */
export function Rating({
  rating,
  reviewCount,
  size = "sm",
  className,
  showCount = true,
}: {
  rating: number | null | undefined;
  reviewCount?: number | null;
  size?: "sm" | "md";
  className?: string;
  showCount?: boolean;
}) {
  if (rating === null || rating === undefined) return null;

  const pct = Math.max(0, Math.min(100, (rating / 5) * 100));
  const stars = size === "md" ? "text-[13px]" : "text-[10.5px]";

  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      <span className={cn("relative inline-flex tracking-[-1px]", stars)}>
        <span className="text-amber-500/25">★★★★★</span>
        <span
          className="absolute inset-0 overflow-hidden text-amber-500"
          style={{ width: `${pct}%` }}
        >
          ★★★★★
        </span>
      </span>
      <span className={cn("font-bold text-headline", size === "md" ? "text-[12.5px]" : "text-[10.5px]")}>
        {rating.toFixed(1)}
      </span>
      {showCount && reviewCount !== null && reviewCount !== undefined ? (
        <span className={cn("text-muted", size === "md" ? "text-[12px]" : "text-[10.5px]")}>
          ({reviewCount >= 1000 ? `${(reviewCount / 1000).toFixed(1)}K` : reviewCount.toLocaleString("en-IN")})
        </span>
      ) : null}
    </span>
  );
}
