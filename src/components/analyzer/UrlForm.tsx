"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardPaste, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

const EXAMPLES = [
  "https://www.amazon.in/dp/B0CX23V2ZK",
  "https://www.flipkart.com/apple-iphone-15-blue-128-gb/p/itm6ac6485515ae4",
];

export function UrlForm({
  size = "lg",
  className,
  defaultValue = "",
}: {
  size?: "md" | "lg";
  className?: string;
  defaultValue?: string;
}) {
  const [url, setUrl] = useState(defaultValue);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  function go(value: string) {
    const v = value.trim();
    if (!v) return;
    setLoading(true);
    router.push(`/analyze?url=${encodeURIComponent(v)}`);
  }

  async function paste() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setUrl(text.trim());
    } catch {
      /* clipboard permission denied */
    }
  }

  return (
    <div className={cn("w-full", className)}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          go(url);
        }}
        className={cn(
          "group flex items-center gap-2 rounded-full border border-line bg-surface p-1.5 backdrop-blur-xl transition-all duration-300 focus-within:border-brand-400/60 focus-within:shadow-[0_0_0_4px_rgba(16,185,129,0.12)]",
          size === "lg" ? "h-16" : "h-14",
        )}
      >
        <span className="pl-3.5 text-ink-muted">
          <Search className="h-5 w-5" />
        </span>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Paste an Amazon or Flipkart product link…"
          className="h-full flex-1 bg-transparent text-[15px] text-ink placeholder:text-ink-muted focus:outline-none"
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="button"
          onClick={paste}
          className="hidden h-10 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-ink-muted transition-colors hover:text-ink sm:flex"
        >
          <ClipboardPaste className="h-4 w-4" /> Paste
        </button>
        <Button type="submit" size={size === "lg" ? "md" : "sm"} disabled={loading || !url.trim()}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Check the deal"}
        </Button>
      </form>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
        <span>Try:</span>
        {EXAMPLES.map((ex, i) => (
          <button
            key={ex}
            onClick={() => {
              setUrl(ex);
              go(ex);
            }}
            className="rounded-full border border-line px-2.5 py-1 transition-colors hover:border-brand-400/50 hover:text-ink"
          >
            {i === 0 ? "an Amazon link" : "a Flipkart link"}
          </button>
        ))}
      </div>
    </div>
  );
}
