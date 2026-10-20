"use client";

import Image from "next/image";
import { useState } from "react";
import { StoreLogoFill } from "@/components/ui/StoreLogo";
import { cn } from "@/lib/utils";

/**
 * Product image with a clean fallback.
 * If a product has no usable image — or the image fails to load — we show the
 * store's app icon on a soft tile instead of an empty grey box.
 * Icons, never clutter.
 */
export function ProductThumb({
  imageUrl,
  alt,
  merchant,
  className,
  imageClassName,
  sizes = "(max-width: 640px) 50vw, 200px",
  padding = "p-2",
  iconScale = 0.4,
}: {
  imageUrl: string | null | undefined;
  alt: string;
  merchant: string;
  className?: string;
  imageClassName?: string;
  sizes?: string;
  padding?: string;
  /** Fallback icon size as a fraction of the tile (0-1). */
  iconScale?: number;
}) {
  const [failed, setFailed] = useState(false);

  if (imageUrl && !failed) {
    return (
      <Image
        src={imageUrl}
        alt={alt}
        fill
        sizes={sizes}
        className={cn("object-contain", padding, imageClassName)}
        onError={() => setFailed(true)}
        unoptimized
      />
    );
  }

  return (
    <span className="absolute inset-0 grid place-items-center p-3">
      <span
        className="grid place-items-center overflow-hidden rounded-2xl bg-card/70 shadow-sm"
        style={{ width: `${Math.round(iconScale * 100)}%`, aspectRatio: "1 / 1" }}
      >
        <StoreLogoFill merchant={merchant} className="opacity-80" />
      </span>
    </span>
  );
}
