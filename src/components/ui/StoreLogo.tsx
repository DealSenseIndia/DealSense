import { cn } from "@/lib/utils";

/** Real store logos (carried over from DealSense 1.0) + a coloured fallback tile. */
const LOGOS: Record<string, string> = {
  amazon: "/brand/stores/amazon-logo.svg",
  flipkart: "/brand/stores/flipkart-icon.svg",
  myntra: "/brand/stores/myntra-logo.svg",
  cr: "/brand/stores/croma-logo.svg",
  crpd: "/brand/stores/croma-logo.svg",
  reliancedigital: "/brand/stores/reliance-digital-logo.svg",
  meesho: "/brand/stores/meesho-logo.svg",
};

const FALLBACK: Record<string, { short: string; color: string; fg: string }> = {
  amazon: { short: "AZ", color: "#FF9900", fg: "#000" },
  flipkart: { short: "FK", color: "#2874F0", fg: "#fff" },
  myntra: { short: "MY", color: "#FF3F6C", fg: "#fff" },
  ajio: { short: "AJ", color: "#2C4152", fg: "#fff" },
  firstcry: { short: "FC", color: "#F48C06", fg: "#fff" },
  libas: { short: "LB", color: "#8B1E5B", fg: "#fff" },
  biba: { short: "BB", color: "#C2185B", fg: "#fff" },
  tatacliq: { short: "TC", color: "#6E2B8B", fg: "#fff" },
  reliancedigital: { short: "RD", color: "#D71920", fg: "#fff" },
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
  const src = LOGOS[key];
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={merchant}
        width={size}
        height={size}
        className={cn("shrink-0 object-contain", rounded && "rounded", className)}
        style={{ width: size, height: size }}
      />
    );
  }
  const fb = FALLBACK[key] ?? { short: key.slice(0, 2).toUpperCase(), color: "#64748B", fg: "#fff" };
  return (
    <span
      className={cn("grid shrink-0 place-items-center font-black text-white", rounded && "rounded-md", className)}
      style={{ width: size, height: size, background: fb.color, fontSize: Math.max(7, size * 0.38) }}
    >
      {fb.short}
    </span>
  );
}

/** Horizontal row of store logos (trust strip). */
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
    <div className={cn("flex flex-wrap items-center gap-2.5", className)}>
      {merchants.map((m) => (
        <StoreLogo key={m} merchant={m} size={size} className="opacity-80 transition-opacity hover:opacity-100" />
      ))}
    </div>
  );
}
