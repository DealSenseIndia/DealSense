"use client";

import { StoreNameRotator } from "./StoreNameRotator";
import { cn } from "@/lib/utils";

/**
 * The grey sentence that sits inside an empty search field.
 * The store name in the middle is bold and cycles.
 */
export function StorePlaceholder({
  hidden,
  className,
  prefix = "Search products or paste",
  suffix = "URL..",
}: {
  hidden: boolean;
  className?: string;
  prefix?: string;
  suffix?: string;
}) {
  if (hidden) return null;

  return (
    <span
      className={cn(
        "pointer-events-none absolute inset-0 flex items-center overflow-hidden whitespace-nowrap text-[13.5px] text-muted",
        className,
      )}
    >
      <span className="shrink-0">{prefix}</span>
      <StoreNameRotator />
      <span className="shrink-0">{suffix}</span>
    </span>
  );
}
