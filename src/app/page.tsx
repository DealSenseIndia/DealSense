import type { Metadata } from "next";
import { Hero } from "@/components/landing/Hero";
import {
  CtaBand,
  Faq,
  Features,
  HowItWorks,
  Integrity,
  StoreMarquee,
} from "@/components/landing/Sections";
import { site } from "@/lib/config";

export const metadata: Metadata = {
  title: `${site.name} — ${site.tagline}`,
  description: site.description,
  alternates: { canonical: "/" },
};

export default function HomePage() {
  return (
    <>
      <Hero />
      <StoreMarquee />
      <HowItWorks />
      <Features />
      <Integrity />
      <Faq />
      <CtaBand />
    </>
  );
}
