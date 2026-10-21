"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardPaste, Link2, Mic, Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { StorePlaceholder } from "@/components/ui/StorePlaceholder";
import { cn } from "@/lib/utils";

const EXAMPLES = [
  "https://www.amazon.in/dp/B0DSKNKCYX",
  "https://www.flipkart.com/apple-iphone-17-lavender-256-gb/p/itm5c650337c09ee?pid=MOBHQV9YDG7CGRAM",
];

export function UrlForm({
  size = "lg",
  className,
  defaultValue = "",
  onValue,
}: {
  size?: "md" | "lg";
  className?: string;
  defaultValue?: string;
  onValue?: (v: string) => void;
}) {
  const [url, setUrl] = useState(defaultValue);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  function update(v: string) {
    setUrl(v);
    onValue?.(v);
  }

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
          "flex items-center gap-2 rounded-2xl border border-hairline bg-card p-2 shadow-card transition-shadow focus-within:border-emerald-400/60 focus-within:shadow-[0_18px_46px_-22px_rgba(16,185,129,0.55)]",
          size === "lg" ? "min-h-[60px]" : "min-h-[54px]",
        )}
      >
        <span className="pl-2.5 text-muted">
          <Link2 className="h-4.5 w-4.5" />
        </span>
        <span className="relative flex min-w-0 flex-1 items-center">
          <StorePlaceholder hidden={url.length > 0} className="px-1" />
          <input
            value={url}
            onChange={(e) => update(e.target.value)}
            placeholder=""
            aria-label="Paste a product link or search for a product"
            className="h-full min-w-0 flex-1 bg-transparent text-[14.5px] text-headline placeholder:text-muted focus:outline-none"
            autoComplete="off"
            spellCheck={false}
          />
        </span>
        <span className="hidden h-5 w-px bg-hairline sm:block" />
        <button
          type="button"
          onClick={paste}
          aria-label="Paste link"
          className="hidden text-muted transition-colors hover:text-headline sm:block"
        >
          <ClipboardPaste className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Voice search"
          className="hidden text-muted transition-colors hover:text-headline md:block"
        >
          <Mic className="h-4 w-4" />
        </button>
        <Button type="submit" size={size === "lg" ? "md" : "sm"} variant="gradient" disabled={loading}>
          {loading ? <span className="h-4 w-4 animate-pulse" /> : <Search className="h-4 w-4" />}
          Analyse
        </Button>
      </form>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-muted">
        <span>Try:</span>
        {EXAMPLES.map((ex, i) => (
          <button
            key={ex}
            onClick={() => {
              update(ex);
              go(ex);
            }}
            className="rounded-full border border-hairline bg-card px-2.5 py-1 font-semibold transition-colors hover:border-emerald-400/50 hover:text-headline"
          >
            {i === 0 ? "an Amazon link" : "a Flipkart link"}
          </button>
        ))}
      </div>
    </div>
  );
}
