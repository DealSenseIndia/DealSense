import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";

export const metadata: Metadata = {
  title: "Privacy",
  description: "What DealSense collects, and what it never collects.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <section className="py-16">
      <Container size="narrow" className="prose-ds">
        <h1 className="text-3xl font-extrabold tracking-tight">Privacy</h1>
        <p>
          DealSense collects the minimum needed to run the product. We do not sell your data.
        </p>
        <h2>What we collect</h2>
        <ul>
          <li>
            <strong>Price observations</strong> — public merchant prices we read to build history.
            No personal data.
          </li>
          <li>
            <strong>Alerts</strong> — if you set a price alert, we store the target and the contact
            you choose (a Telegram chat or an email address) so we can notify you.
          </li>
          <li>
            <strong>Anonymous analytics</strong> — aggregate counts of analyses and verdicts, with no
            personal identifiers.
          </li>
        </ul>
        <h2>What we never do</h2>
        <ul>
          <li>We never sell or rent your contact details.</li>
          <li>We never store card numbers or payment credentials — we don&apos;t take payments.</li>
          <li>We never fabricate prices or reviews.</li>
        </ul>
        <h2>Removing your data</h2>
        <p>
          You can disable any alert at any time, which stops all notifications. Contact us to delete
          an alert and its contact entirely.
        </p>
      </Container>
    </section>
  );
}
