"use client";

import { useEffect } from "react";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error(error);
  }, [error]);

  return (
    <section className="relative py-28">
      <Container className="text-center">
        <div className="text-6xl">⚠️</div>
        <h1 className="mt-5 text-2xl font-bold">Something went wrong</h1>
        <p className="mx-auto mt-3 max-w-md text-ink-soft">
          An unexpected error occurred. It&apos;s not you — try again.
        </p>
        <div className="mt-8 flex justify-center">
          <Button onClick={reset}>Try again</Button>
        </div>
      </Container>
    </section>
  );
}
