import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { ButtonLink } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <section className="relative py-28">
      <Container className="text-center">
        <div className="tabular text-7xl font-extrabold gradient-text">404</div>
        <h1 className="mt-4 text-2xl font-bold">That page slipped through the cracks</h1>
        <p className="mx-auto mt-3 max-w-md text-ink-soft">
          The link may be broken, or the product isn&apos;t in our catalogue yet. Try analyzing a
          product link instead.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <ButtonLink href="/analyze">Analyze a link</ButtonLink>
          <Link
            href="/deals"
            className="inline-flex h-11 items-center rounded-full border border-line px-6 text-sm font-semibold text-ink-soft hover:text-ink"
          >
            Live deals
          </Link>
        </div>
      </Container>
    </section>
  );
}
