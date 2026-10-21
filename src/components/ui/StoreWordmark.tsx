import { cn } from "@/lib/utils";

/**
 * Real store logos, taken from the stores themselves.
 *
 * These are the same artwork pricehistory.ai uses — the real Flipkart "f",
 * the Myntra M, the Nykaa N — so the footer shows the marks shoppers
 * recognise rather than coloured initials.
 */
const WORDMARKS: Record<string, string> = {
  amazon: "/brand/stores/phai/amazon.png",
  flipkart: "/brand/stores/phai/flipkart.png",
  myntra: "/brand/stores/phai/myntra.png",
  tatacliq: "/brand/stores/phai/tata-cliq.png",
  nykaa: "/brand/stores/phai/nykaa.png",
  firstcry: "/brand/stores/phai/firstcry.png",
  reliancedigital: "/brand/stores/phai/reliance-digital.png",
  biba: "/brand/stores/phai/biba.png",
  libas: "/brand/stores/phai/libas.png",
  ajio: "/brand/stores/phai/ajio.png",
};

/** The stores we have no wordmark for, kept as square app icons. */
const ICONS: Record<string, string> = {
  croma: "/brand/stores/icons/croma.png",
  meesho: "/brand/stores/icons/meesho.png",
  shopsy: "/brand/stores/icons/shopsy.png",
};

export function hasStoreLogo(merchant: string): boolean {
  const key = merchant.toLowerCase().replace(/[^a-z]/g, "");
  return Boolean(WORDMARKS[key] || ICONS[key]);
}

export function StoreWordmark({
  merchant,
  height = 22,
  className,
}: {
  merchant: string;
  height?: number;
  className?: string;
}) {
  const key = merchant.toLowerCase().replace(/[^a-z]/g, "");
  const src = WORDMARKS[key] ?? ICONS[key];

  if (!src) {
    return (
      <span
        className={cn(
          "inline-flex items-center text-[11px] font-extrabold uppercase tracking-wide text-secondary",
          className,
        )}
      >
        {merchant}
      </span>
    );
  }

  const square = Boolean(ICONS[key] && !WORDMARKS[key]);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={merchant}
      title={merchant}
      className={cn(
        "shrink-0 object-contain",
        square ? "rounded-[18%]" : "max-w-full",
        className,
      )}
      style={{ height, width: square ? height : "auto", maxWidth: "100%" }}
    />
  );
}

/** A row of store logos, evenly spaced. */
export function StoreWordmarkRow({
  merchants,
  height = 22,
  className,
}: {
  merchants: string[];
  height?: number;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-6 gap-y-3", className)}>
      {merchants.map((m) => (
        <StoreWordmark key={m} merchant={m} height={height} />
      ))}
    </div>
  );
}
