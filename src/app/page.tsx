import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { Hero } from "@/components/landing/Hero";
import { DealsSection } from "@/components/landing/DealsSection";
import { HowItWorks, Integrity, Faq, CtaBand } from "@/components/landing/Sections";
import { getLiveDeals } from "@/lib/engine/deals";
import { site } from "@/lib/config";

export const metadata: Metadata = {
  title: `${site.name} — ${site.tagline}`,
  description: site.description,
  alternates: { canonical: "/" },
};

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const deals = await getLiveDeals(48);

  return (
    <>
      <Hero />
      <DealsSection deals={deals} />
      <HowItWorks />
      <Integrity />
      <Faq />
      <CtaBand />
    </>
  );
}
