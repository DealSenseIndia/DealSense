"use client";

import { useEffect, useState } from "react";
import { trackedStores } from "@/lib/config";
import { cn } from "@/lib/utils";

const NAMES = trackedStores.map((s) => s.name);

/**
 * A store name that cycles, one at a time, inside the search field.
 *
 * It reads as part of the sentence — "Search products or paste Amazon URL.."
 * then Flipkart, then Myntra — so the visitor sees which stores we cover
 * without a row of tiny icons.
 */
export function StoreNameRotator({
  className,
  interval = 2400,
}: {
  className?: string;
  interval?: number;
}) {
  const [i, setI] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setI((v) => (v + 1) % NAMES.length), interval);
    return () => clearInterval(t);
  }, [interval]);

  return (
    <span
      className={cn(
        "relative mx-1 inline-flex h-[1.3em] flex-col justify-center overflow-hidden align-middle",
        className,
      )}
    >
      <span
        key={i}
        className="store-name-slot block whitespace-nowrap font-bold text-[var(--dw-green-mid)]"
      >
        {NAMES[i]}
      </span>
    </span>
  );
}
