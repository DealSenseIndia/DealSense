import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";

export const metadata: Metadata = {
  title: "Affiliate disclosure",
  description: "How DealSense makes money — and why our verdict is never for sale.",
  alternates: { canonical: "/disclosure" },
};

export default function DisclosurePage() {
  return (
    <section className="py-16">
      <Container size="narrow" className="prose-ds">
        <h1 className="text-3xl font-extrabold tracking-tight">Affiliate disclosure</h1>
        <p>
          DealSense is free to use. We earn money through affiliate commissions: when you buy a
          product after clicking through from DealSense, the merchant (Amazon, Flipkart and others)
          pays us a small percentage of the sale. You pay exactly the same price.
        </p>
        <h2>Our verdict is not for sale</h2>
        <p>
          Our recommendation is decoupled from how much a merchant pays us. If Flipkart is cheaper,
          we say Flipkart — even when Amazon would pay us more. Trust is the product.
        </p>
        <h2>Prices</h2>
        <p>
          We verify prices by reading the live merchant page and timestamp every observation.
          Prices and availability can change at any moment, so always confirm the final price at
          checkout. DealSense shows the time of our last verification on every listing.
        </p>
        <h2>Questions</h2>
        <p>Reach us any time through the site and we&apos;ll respond.</p>
      </Container>
    </section>
  );
}
