import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { SearchResults } from "@/components/search/SearchResults";

export const metadata: Metadata = {
  title: "Search products",
  description:
    "Search Amazon India and Flipkart for any product and see its real price, true landed cost and verdict.",
  alternates: { canonical: "/search" },
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  return (
    <section className="relative py-10">
      <Container size="wide">
        <SearchResults initialQuery={q ?? ""} />
      </Container>
    </section>
  );
}
