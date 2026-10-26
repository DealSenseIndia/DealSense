"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Search } from "lucide-react";
import { StorePlaceholder } from "@/components/ui/StorePlaceholder";

/** Compact page-level search (inner pages). The homepage has its own hero search. */
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
    <form onSubmit={go} className={className}>
      <div className="flex h-11 items-center gap-2.5 rounded-xl border border-hairline bg-card px-3.5 transition-colors focus-within:border-emerald-400/60">
        <Search className="h-4 w-4 shrink-0 text-muted" />
        <span className="relative flex min-w-0 flex-1 items-center">
          <StorePlaceholder hidden={q.length > 0} className="text-[13px]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder=""
            aria-label={placeholder}
            className="h-full min-w-0 flex-1 bg-transparent text-[13.5px] text-headline placeholder:text-muted focus:outline-none"
            autoComplete="off"
            spellCheck={false}
          />
        </span>
        <button
          type="submit"
          className="btn-cta h-8 shrink-0 rounded-lg px-3.5 text-[12px] font-extrabold"
        >
          Search
        </button>
      </div>
    </form>
  );
}
