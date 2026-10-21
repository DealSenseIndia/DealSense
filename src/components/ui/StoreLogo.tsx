import { cn } from "@/lib/utils";

/**
 * Square app-style store icons, fetched from each store's own site /
 * the Google favicon service and normalised to 128px PNGs.
 * No wordmarks — icons read cleanly at every size.
 */
const ICONS: Record<string, string> = {
  tatacliq: "/brand/stores/icons/tatacliq.png",
  croma: "/brand/stores/icons/croma.png",
  reliancedigital: "/brand/stores/icons/reliancedigital.png",
  meesho: "/brand/stores/icons/meesho.png",
  firstcry: "/brand/stores/icons/firstcry.png",
  biba: "/brand/stores/icons/biba.png",
  ajio: "/brand/stores/icons/ajio.png",
  libas: "/brand/stores/icons/libas.png",
  shopsy: "/brand/stores/icons/shopsy.png",
};

/**
 * The stores whose real brand mark is a transparent logo rather than an
 * app tile — these are drawn by the store itself and read better than any
 * square we could fake.
 */
const MARKS: Record<string, string> = {
  amazon: "/brand/stores/phai/amazon.png",
  flipkart: "/brand/stores/phai/flipkart.png",
  myntra: "/brand/stores/phai/myntra.png",
  nykaa: "/brand/stores/phai/nykaa.png",
};

const FALLBACK: Record<string, { short: string; color: string }> = {
  amazon: { short: "AZ", color: "#FF9900" },
  flipkart: { short: "FK", color: "#2874F0" },
  myntra: { short: "MY", color: "#FF3F6C" },
  ajio: { short: "AJ", color: "#2C4152" },
  firstcry: { short: "FC", color: "#F48C06" },
  libas: { short: "LB", color: "#8B1E5B" },
  biba: { short: "BB", color: "#C2185B" },
  tatacliq: { short: "TC", color: "#6E2B8B" },
  reliancedigital: { short: "RD", color: "#D71920" },
  croma: { short: "CR", color: "#00A0E9" },
  meesho: { short: "MS", color: "#57057A" },
  nykaa: { short: "NY", color: "#E5008E" },
  shopsy: { short: "SH", color: "#6D22B8" },
};

export function StoreLogo({
  merchant,
  className,
  size = 20,
  rounded = true,
}: {
  merchant: string;
  className?: string;
  size?: number;
  rounded?: boolean;
}) {
  const key = merchant.toLowerCase().replace(/[^a-z]/g, "");
  const mark = MARKS[key];
  const src = mark ?? ICONS[key];

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={merchant}
        width={size}
        height={size}
        className={cn(
          "shrink-0 object-contain",
          !mark && rounded && "rounded-[22%]",
          className,
        )}
        style={{ width: size, height: size }}
      />
    );
  }

  const fb = FALLBACK[key] ?? { short: key.slice(0, 2).toUpperCase(), color: "#64748B" };
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center font-black text-white",
        rounded && "rounded-[22%]",
        className,
      )}
      style={{ width: size, height: size, background: fb.color, fontSize: Math.max(7, size * 0.4) }}
    >
      {fb.short}
    </span>
  );
}

/** Horizontal row of store icons (trust strip). */
export function StoreLogoRow({
  merchants,
  size = 26,
  className,
}: {
  merchants: string[];
  size?: number;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-2", className)}>
      {merchants.map((m) => (
        <StoreLogo
          key={m}
          merchant={m}
          size={size}
          className="opacity-90 transition-opacity hover:opacity-100"
        />
      ))}
    </div>
  );
}

/**
 * Store logo that fills its parent box (used as a product-image fallback).
 * The parent controls the size.
 */
export function StoreLogoFill({
  merchant,
  className,
}: {
  merchant: string;
  className?: string;
}) {
  const key = merchant.toLowerCase().replace(/[^a-z]/g, "");
  const src = ICONS[key];
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={merchant}
        className={cn("h-full w-full object-contain", className)}
      />
    );
  }

  const fb = FALLBACK[key] ?? { short: key.slice(0, 2).toUpperCase(), color: "#64748B" };
  return (
    <span
      className={cn("grid h-full w-full place-items-center font-black text-white", className)}
      style={{ background: fb.color, fontSize: "32%" }}
    >
      {fb.short}
    </span>
  );
}
