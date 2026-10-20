import { cn } from "@/lib/utils";

/**
 * Store logos fetched fresh from online sources (Simple Icons + Wikimedia),
 * never from the legacy project. Missing stores fall back to a coloured tile.
 */
const LOGOS: Record<string, string> = {
  amazon: "/brand/stores/amazon.svg",
  flipkart: "/brand/stores/flipkart.svg",
  myntra: "/brand/stores/myntra.png",
  tatacliq: "/brand/stores/tatacliq.png",
  croma: "/brand/stores/croma.png",
  reliancedigital: "/brand/stores/reliancedigital.png",
  meesho: "/brand/stores/meesho.png",
  nykaa: "/brand/stores/nykaa.png",
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
};

export function StoreLogo({
  merchant,
  className,
  size = 20,
}: {
  merchant: string;
  className?: string;
  size?: number;
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
        className={cn("shrink-0 object-contain", className)}
        // Wordmarks are wide; let them breathe instead of being crushed into a square.
        style={{ maxWidth: size * 3.4, maxHeight: size, width: "auto", height: "auto" }}
      />
    );
  }
  const fb = FALLBACK[key] ?? { short: key.slice(0, 2).toUpperCase(), color: "#64748B" };
  return (
    <span
      className={cn("grid shrink-0 place-items-center font-black text-white", className)}
      style={{ width: size, height: size, background: fb.color, fontSize: Math.max(7, size * 0.4) }}
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
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-2", className)}>
      {merchants.map((m) => (
        <StoreLogo
          key={m}
          merchant={m}
          size={size}
          className="opacity-80 transition-opacity hover:opacity-100"
        />
      ))}
    </div>
  );
}
