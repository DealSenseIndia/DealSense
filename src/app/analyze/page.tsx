import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { AnalyzeClient } from "@/components/analyzer/AnalyzeClient";

export const metadata: Metadata = {
  title: "Analyze a product link",
  description:
    "Paste any Amazon or Flipkart link and get an honest BUY / WAIT / AVOID verdict with real price history and true landed cost.",
  alternates: { canonical: "/analyze" },
};

export default async function AnalyzePage({
  searchParams,
}: {
  searchParams: Promise<{ url?: string }>;
}) {
  const { url } = await searchParams;
  return (
    <section className="relative py-14 sm:py-20">
      <Container>
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Check any deal</h1>
          <p className="mt-3 text-ink-soft">
            Drop in an Amazon or Flipkart link. We&apos;ll read the live price and give you the truth.
          </p>
        </div>
        <AnalyzeClient initialUrl={url} />
      </Container>
    </section>
  );
}
