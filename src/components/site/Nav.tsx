"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Menu, Sparkles, X } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { ButtonLink } from "@/components/ui/Button";
import { ThemeToggle } from "./ThemeToggle";
import { cn } from "@/lib/utils";

const links = [
  { href: "/deals", label: "Live deals" },
  { href: "/analyze", label: "Analyze a link" },
  { href: "/#how", label: "How it works" },
  { href: "/#faq", label: "FAQ" },
];

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 transition-all duration-300",
        scrolled ? "border-b border-line backdrop-blur-xl bg-[var(--void)]/70" : "border-b border-transparent",
      )}
    >
      <Container size="wide" className="flex h-16 items-center justify-between gap-4">
        <Link href="/" className="group flex items-center gap-2.5">
          <span className="relative grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-400 to-sky-500 text-[#04140d] shadow-[0_8px_30px_-10px_rgba(16,185,129,0.9)]">
            <Sparkles className="h-4.5 w-4.5" strokeWidth={2.5} />
          </span>
          <span className="text-[17px] font-extrabold tracking-tight">
            Deal<span className="gradient-text">Sense</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-full px-3.5 py-2 text-sm font-medium text-ink-soft transition-colors hover:bg-surface-raised hover:text-ink"
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <ButtonLink href="/analyze" size="sm" className="hidden sm:inline-flex">
            Check a deal
          </ButtonLink>
          <button
            className="grid h-9 w-9 place-items-center rounded-full border border-line text-ink md:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-label="Menu"
          >
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </Container>

      {open && (
        <div className="border-t border-line bg-[var(--void)]/95 backdrop-blur-xl md:hidden">
          <Container className="flex flex-col py-3">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-3 text-sm font-medium text-ink-soft hover:bg-surface-raised hover:text-ink"
              >
                {l.label}
              </Link>
            ))}
          </Container>
        </div>
      )}
    </header>
  );
}
