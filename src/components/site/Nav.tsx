"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Bell, Menu, Search, X } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { ThemeToggle } from "./ThemeToggle";
import { cn } from "@/lib/utils";

const links = [
  { href: "/", label: "Home" },
  { href: "/price-history", label: "Price History" },
  { href: "/deals", label: "Deals" },
  { href: "/categories", label: "Categories" },
  { href: "/track", label: "Track" },
];

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 transition-all duration-300",
        scrolled
          ? "border-b border-hairline bg-[var(--bg-header)] backdrop-blur-xl"
          : "border-b border-transparent",
      )}
    >
      <Container size="wide" className="flex h-16 items-center gap-4">
        <Link href="/" className="group flex shrink-0 items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-accent text-white shadow-[0_6px_18px_-6px_rgba(16,185,129,0.8)]">
            <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 15l5-5 4 4 7-7" />
              <path d="M20 7h-5m5 0v5" />
            </svg>
          </span>
          <span className="leading-none">
            <span className="block text-[17px] font-extrabold tracking-tight text-headline">
              Deal<span className="text-emerald-accent">Sense</span>
            </span>
            <span className="mt-0.5 block text-[10.5px] font-medium text-muted">
              Shop smart. Save more.
            </span>
          </span>
        </Link>

        <nav className="ml-4 hidden items-center gap-1 lg:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                "rounded-lg px-3 py-2 text-[13.5px] font-semibold transition-colors",
                l.href === "/"
                  ? "bg-emerald-accent/10 text-emerald-accent"
                  : "text-body hover:bg-elevated hover:text-headline",
              )}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (q.trim()) window.location.href = `/search?q=${encodeURIComponent(q.trim())}`;
          }}
          className="ml-auto hidden min-w-0 max-w-md flex-1 md:block"
        >
          <div className="flex h-10 items-center gap-2 rounded-xl border border-hairline bg-subtle px-3 transition-colors focus-within:border-emerald-accent/50 focus-within:bg-card">
            <Search className="h-4 w-4 shrink-0 text-muted" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search for products, brands or categories"
              className="h-full w-full bg-transparent text-[13px] text-headline placeholder:text-muted focus:outline-none"
            />
          </div>
        </form>

        <div className="ml-auto flex items-center gap-2 md:ml-0">
          <Link
            href="/track"
            aria-label="Alerts"
            className="relative grid h-9 w-9 place-items-center rounded-lg border border-hairline text-body transition-colors hover:text-headline"
          >
            <Bell className="h-4 w-4" />
            <span className="absolute right-2 top-1.5 h-1.5 w-1.5 rounded-full bg-emerald-accent" />
          </Link>
          <ThemeToggle />
          <button
            className="grid h-9 w-9 place-items-center rounded-lg border border-hairline text-body lg:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-label="Menu"
          >
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </Container>

      {open && (
        <div className="border-t border-hairline bg-[var(--bg-header)] backdrop-blur-xl lg:hidden">
          <Container className="flex flex-col py-2">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (q.trim()) window.location.href = `/search?q=${encodeURIComponent(q.trim())}`;
              }}
              className="py-2 md:hidden"
            >
              <div className="flex h-10 items-center gap-2 rounded-xl border border-hairline bg-subtle px-3">
                <Search className="h-4 w-4 text-muted" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search products…"
                  className="h-full w-full bg-transparent text-[13px] focus:outline-none"
                />
              </div>
            </form>
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2.5 text-sm font-semibold text-body hover:bg-elevated hover:text-headline"
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
