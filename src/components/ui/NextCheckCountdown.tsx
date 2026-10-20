"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

function pad(n: number) {
  return n < 10 ? `0${n}` : String(n);
}

/**
 * Live countdown to the next hourly price check.
 *
 * The refresh worker runs on the hour, so this is the real time until the
 * next scheduled check — not a fake flash-sale timer.
 */
export function NextCheckCountdown({
  className,
  labels = true,
}: {
  className?: string;
  labels?: boolean;
}) {
  const [left, setLeft] = useState<number | null>(null);

  useEffect(() => {
    function tick() {
      const now = new Date();
      const next = new Date(now);
      next.setHours(now.getHours() + 1, 0, 0, 0);
      setLeft(Math.max(0, next.getTime() - now.getTime()));
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  if (left === null) {
    return <span className={cn("tabular text-[11px] font-bold text-muted", className)}>--:--:--</span>;
  }

  const totalSeconds = Math.floor(left / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;

  return (
    <span className={cn("inline-flex flex-col items-center", className)}>
      <span className="tabular text-[12.5px] font-black leading-none text-headline">
        {pad(h)}:{pad(m)}:{pad(s)}
      </span>
      {labels ? (
        <span className="mt-1 flex gap-[3px] text-[8px] font-bold uppercase tracking-wider text-muted">
          <span className="w-[15px] text-center">Hrs</span>
          <span className="w-[15px] text-center">Min</span>
          <span className="w-[15px] text-center">Sec</span>
        </span>
      ) : null}
    </span>
  );
}
