"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Search } from "lucide-react";
import { StorePlaceholder } from "@/components/ui/StorePlaceholder";
import { cn } from "@/lib/utils";

/**
 * Page-level search. The nova frame (a gradient travelling around the border)
 * wraps a curved rectangle rather than a pill: it reads as an input, not a
 * button, and the same frame is used by the navigation bar.
 */
export function PageSearch({
  placeholder = "Search products or paste a link…",
  initial = "",
  className = "",
}: {
  placeholder?: string;
  initial?: string;
  className?: string;
}) {
  const [q, setQ] = useState(initial);
  const router = useRouter();

  function go(e: React.FormEvent) {
    e.preventDefault();
    const v = q.trim();
    if (!v) return;
    if (/^https?:\/\//i.test(v)) router.push(`/analyze?url=${encodeURIComponent(v)}`);
    else router.push(`/search?q=${encodeURIComponent(v)}`);
  }

  return (
    <form onSubmit={go} className={cn("nova-frame", className)}>
      <div className="nova-inner flex h-[54px] items-center gap-2 rounded-[19px] pl-2 pr-2 transition-shadow focus-within:shadow-[0_0_0_4px_rgba(16,185,129,0.12)]">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--dw-green-surface)] text-[var(--dw-green-mid)]">
          <Search className="h-4 w-4" />
        </span>
        <span className="relative flex min-w-0 flex-1 items-center">
          <StorePlaceholder hidden={q.length > 0} className="text-[13.5px]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder=""
            aria-label={placeholder}
            className="h-full min-w-0 flex-1 bg-transparent text-[14px] text-headline placeholder:text-muted focus:outline-none"
            autoComplete="off"
            spellCheck={false}
          />
        </span>
        <kbd className="mr-1 hidden rounded-md border border-hairline bg-subtle px-1.5 py-0.5 text-[9.5px] font-bold text-muted sm:inline">
          ↵
        </kbd>
        <button type="submit" className="btn-cta h-9 shrink-0 px-4 text-[12.5px] font-extrabold">
          Search
        </button>
      </div>
    </form>
  );
}
