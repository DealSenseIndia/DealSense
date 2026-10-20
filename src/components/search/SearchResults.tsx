"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronRight, Loader2, Search, Star } from "lucide-react";
import { StoreLogo } from "@/components/ui/StoreLogo";
import { Button } from "@/components/ui/Button";
import { cn, formatINR } from "@/lib/utils";

interface Hit {
  merchant: "amazon" | "flipkart" | string;
  merchantProductId: string;
  title: string;
  price: number | null;
  mrp: number | null;
  rating: number | null;
  reviewCount: number | null;
  imageUrl: string | null;
  url: string;
}

const SUGGESTED = ["iPhone 17", "Samsung Galaxy S25", "OnePlus Nord Buds 3r", "vivo T5 Lite", "Air Fryer", "Levis Jeans"];

export function SearchResults({ initialQuery }: { initialQuery: string }) {
  const [q, setQ] = useState(initialQuery);
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  async function run(term: string) {
    const t = term.trim();
    if (!t) return;
    setLoading(true);
    setError(null);
    setSearched(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(t)}`);
      const data = await res.json();
      if (data.ok) setHits(data.results ?? []);
      else setError(data.error ?? "Search failed.");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (initialQuery) run(initialQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery]);

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          routerPush(q);
          run(q);
        }}
        className="flex items-center gap-2 rounded-2xl border border-hairline bg-card p-2 shadow-card focus-within:border-emerald-400/60"
      >
        <span className="pl-2.5 text-muted">
          <Search className="h-4.5 w-4.5" />
        </span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search products, brands or categories…"
          className="h-10 min-w-0 flex-1 bg-transparent text-[14.5px] text-headline placeholder:text-muted focus:outline-none"
          autoComplete="off"
        />
        <Button type="submit" variant="gradient" size="sm" disabled={loading}>
          {loading ? <span className="h-3.5 w-3.5 animate-spin" /> : "Search"}
        </Button>
      </form>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-[12px] font-bold text-muted">Popular:</span>
        {SUGGESTED.map((s) => (
          <button
            key={s}
            onClick={() => {
              setQ(s);
              routerPush(s);
              run(s);
            }}
            className="rounded-full border border-hairline bg-card px-3 py-1.5 text-[12px] font-semibold text-body transition-all hover:-translate-y-0.5 hover:border-emerald-400/50 hover:text-headline"
          >
            {s}
          </button>
        ))}
      </div>

      {loading && (
        <div className="mt-10 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="aspect-[3/4] animate-pulse rounded-2xl border border-hairline bg-subtle" />
          ))}
        </div>
      )}

      {error && !loading && (
        <p className="mt-8 rounded-xl border border-amber-400/30 bg-amber-500/10 p-4 text-center text-[13.5px] text-amber-700 dark:text-amber-300">
          {error}
        </p>
      )}

      {!loading && searched && hits.length === 0 && !error && (
        <div className="mt-10 rounded-2xl border border-dashed border-hairline bg-subtle p-12 text-center">
          <div className="text-4xl">🔍</div>
          <h2 className="mt-4 text-lg font-extrabold text-headline">No results</h2>
          <p className="mx-auto mt-2 max-w-md text-[13.5px] text-body">
            Try a different spelling, or paste a product link directly.
          </p>
        </div>
      )}

      {!loading && hits.length > 0 && (
        <>
          <p className="mt-8 text-[13px] font-bold text-secondary">
            <span className="tabular text-headline">{hits.length}</span> results for &ldquo;{q}&rdquo;
          </p>
          <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
            {hits.map((h) => {
              const analyzeUrl = `/analyze?url=${encodeURIComponent(h.url)}`;
              const discount =
                h.mrp && h.price && h.mrp > h.price
                  ? Math.round(((h.mrp - h.price) / h.mrp) * 100)
                  : null;
              return (
                <article
                  key={`${h.merchant}-${h.merchantProductId}`}
                  className="group flex flex-col overflow-hidden rounded-card border border-hairline bg-card shadow-card transition-all hover:-translate-y-1 hover:border-emerald-400/50 hover:shadow-lift"
                >
                  <Link href={analyzeUrl} className="relative block aspect-square overflow-hidden bg-subtle">
                    {h.imageUrl ? (
                      <Image
                        src={h.imageUrl}
                        alt={h.title}
                        fill
                        sizes="(max-width: 640px) 50vw, 220px"
                        className="object-contain p-3 transition-transform duration-500 group-hover:scale-105"
                        unoptimized
                      />
                    ) : (
                      <div className="grid h-full place-items-center text-2xl text-muted">🛍️</div>
                    )}
                    <StoreLogo
                      merchant={h.merchant}
                      size={20}
                      className="absolute right-2 top-2 shadow-sm"
                    />
                  </Link>
                  <div className="flex flex-1 flex-col p-3">
                    <Link
                      href={analyzeUrl}
                      className="line-clamp-2 min-h-[2.2rem] text-[12px] font-bold leading-snug text-headline transition-colors hover:text-[var(--dw-green-mid)]"
                    >
                      {h.title}
                    </Link>
                    {h.rating !== null && (
                      <div className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-secondary">
                        <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                        {h.rating}
                        {h.reviewCount ? (
                          <span className="text-muted">({h.reviewCount.toLocaleString("en-IN")})</span>
                        ) : null}
                      </div>
                    )}
                    <div className="mt-auto flex items-end justify-between gap-2 pt-2">
                      <div>
                        <div className="tabular text-[16px] font-extrabold leading-none text-headline">
                          {h.price !== null ? formatINR(h.price) : "—"}
                        </div>
                        {h.mrp && h.price && h.mrp > h.price && (
                          <div className="tabular mt-1 text-[10.5px] text-muted line-through">
                            {formatINR(h.mrp)}
                          </div>
                        )}
                      </div>
                      {discount !== null && (
                        <div className="text-[11.5px] font-extrabold text-[var(--dw-green-mid)]">
                          {discount}% off
                        </div>
                      )}
                    </div>
                    <Link
                      href={analyzeUrl}
                      className="mt-3 inline-flex h-8 items-center justify-center gap-1 rounded-btn bg-gradient-brand text-[11.5px] font-extrabold text-white transition-transform hover:-translate-y-0.5"
                    >
                      Check deal <ChevronRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function routerPush(q: string) {
  if (typeof window !== "undefined") {
    window.history.replaceState(null, "", `/search?q=${encodeURIComponent(q.trim())}`);
  }
}
