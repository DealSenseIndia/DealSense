import type { Metadata } from "next";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { SearchResults } from "@/components/search/SearchResults";

export const metadata: Metadata = {
  title: "Search products",
  description:
    "Search Amazon India and Flipkart in real time, then see any product's real price history, true landed cost and buy / wait / avoid verdict.",
  alternates: { canonical: "/search" },
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;

  return (
    <section className="relative py-8">
      <Container size="wide">
        <nav className="flex items-center gap-1.5 text-[12.5px] font-semibold text-muted">
          <Link href="/" className="text-[var(--dw-green-mid)] hover:underline">
            Home
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span>Search</span>
        </nav>

        <div className="mt-4">
          <h1 className="text-[30px] font-extrabold tracking-[-0.03em] text-headline sm:text-[40px]">
            Search <span className="text-gradient-brand">anything</span>
          </h1>
          <p className="mt-2 max-w-xl text-[14.5px] leading-relaxed text-body">
            Live results from Amazon India and Flipkart. Open any product for its real price history
            and verdict.
          </p>
        </div>

        <div className="mt-7">
          <SearchResults initialQuery={q ?? ""} />
        </div>
      </Container>
    </section>
  );
}
