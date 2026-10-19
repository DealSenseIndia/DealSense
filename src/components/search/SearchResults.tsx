"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Search, Star } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatINR } from "@/lib/utils";
import { merchantMeta } from "@/lib/config";

interface Hit {
  merchant: "amazon" | "flipkart";
  merchantProductId: string;
  title: string;
  price: number | null;
  mrp: number | null;
  rating: number | null;
  reviewCount: number | null;
  imageUrl: string | null;
  url: string;
}

export function SearchResults({ initialQuery }: { initialQuery: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const router = useRouter();

  async function run(q: string) {
    if (!q.trim()) return;
    setLoading(true);
    setError(null);
    setSearched(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}`);
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

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    router.replace(`/search?q=${encodeURIComponent(q)}`);
    run(q);
  }

  return (
    <div>
      <div className="text-center">
        <h1 className="text-[30px] font-extrabold tracking-tight text-headline sm:text-[36px]">
          Search any product
        </h1>
        <p className="mx-auto mt-2 max-w-xl text-[14.5px] text-body">
          Live results from Amazon India and Flipkart. Open any product to get its real price
          history, landed cost and verdict.
        </p>
      </div>

      <form
        onSubmit={submit}
        className="mx-auto mt-7 flex max-w-2xl items-center gap-2 rounded-2xl border border-hairline bg-card p-2 shadow-card"
      >
        <span className="pl-2 text-muted">
          <Search className="h-4.5 w-4.5" />
        </span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search products, brands or categories…"
          className="h-10 min-w-0 flex-1 bg-transparent text-[14.5px] text-headline placeholder:text-muted focus:outline-none"
          autoComplete="off"
        />
        <Button type="submit" disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
        </Button>
      </form>

      {loading && (
        <div className="mt-10 grid grid-cols-2 gap-4 md:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="aspect-[3/4] animate-pulse rounded-card border border-hairline bg-subtle" />
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
          <h3 className="mt-4 text-lg font-extrabold text-headline">No results</h3>
          <p className="mt-2 text-[13.5px] text-body">
            Try a different spelling, or paste a product link directly.
          </p>
          <Link
            href="/analyze"
            className="mt-5 inline-flex h-10 items-center rounded-btn bg-emerald-accent px-5 text-[13px] font-extrabold text-white"
          >
            Analyze a link instead
          </Link>
        </div>
      )}

      {!loading && hits.length > 0 && (
        <>
          <p className="mt-8 text-[13px] font-bold text-secondary">
            <span className="tabular text-headline">{hits.length}</span> results for &ldquo;{query}&rdquo;
          </p>
          <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
            {hits.map((h) => {
              const meta = merchantMeta[h.merchant];
              const analyzeUrl = `/analyze?url=${encodeURIComponent(h.url)}`;
              return (
                <article
                  key={`${h.merchant}-${h.merchantProductId}`}
                  className="group flex flex-col overflow-hidden rounded-card border border-hairline bg-card shadow-card transition-all hover:-translate-y-1 hover:border-emerald-accent/40 hover:shadow-lift"
                >
                  <Link
                    href={analyzeUrl}
                    className="relative block aspect-square overflow-hidden bg-subtle"
                  >
                    {h.imageUrl ? (
                      <Image
                        src={h.imageUrl}
                        alt={h.title}
                        fill
                        sizes="(max-width: 768px) 50vw, 220px"
                        className="object-contain p-3 transition-transform duration-500 group-hover:scale-105"
                        unoptimized
                      />
                    ) : (
                      <div className="grid h-full place-items-center text-2xl text-muted">🛍️</div>
                    )}
                    <span
                      className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-md text-[8px] font-black text-white"
                      style={{ background: meta.color }}
                    >
                      {meta.short}
                    </span>
                  </Link>
                  <div className="flex flex-1 flex-col p-3">
                    <Link
                      href={analyzeUrl}
                      className="line-clamp-2 min-h-[2.2rem] text-[12.5px] font-bold leading-snug text-headline hover:text-[var(--dw-green-mid)]"
                    >
                      {h.title}
                    </Link>
                    {h.rating !== null && (
                      <div className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-secondary">
                        <Star className="h-3 w-3 fill-amber-400 text-amber-400" /> {h.rating}
                      </div>
                    )}
                    <div className="tabular mt-1.5 text-[17px] font-extrabold text-headline">
                      {h.price !== null ? formatINR(h.price) : (
                        <span className="text-[12px] font-bold text-muted">Price on click</span>
                      )}
                    </div>
                    <Link
                      href={analyzeUrl}
                      className="mt-2.5 inline-flex h-8 items-center justify-center rounded-btn bg-emerald-accent text-[11.5px] font-extrabold text-white hover:bg-[var(--dw-green-mid)]"
                    >
                      Check deal
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
