"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Menu, Mic, Search, X } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { ThemeToggle } from "./ThemeToggle";
import { cn } from "@/lib/utils";

const links = [
  { href: "/deals", label: "Deals" },
  { href: "/price-history", label: "Price History" },
  { href: "/categories", label: "Categories" },
  { href: "/track", label: "Track" },
];

const STORES = [
  { label: "Amazon", short: "a", bg: "#FF9900", fg: "#000" },
  { label: "Flipkart", short: "f", bg: "#2874F0", fg: "#fff" },
  { label: "Croma", short: "C", bg: "#00A0E9", fg: "#fff" },
];

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const router = useRouter();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 6);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = q.trim();
    if (!v) return;
    if (/^https?:\/\//i.test(v)) router.push(`/analyze?url=${encodeURIComponent(v)}`);
    else router.push(`/search?q=${encodeURIComponent(v)}`);
  }

  return (
    <header
      className={cn(
        "sticky top-0 z-50 transition-all duration-300",
        scrolled
          ? "border-b border-hairline bg-[var(--bg-header)] backdrop-blur-xl"
          : "border-b border-transparent",
      )}
    >
      <Container size="wide">
        {/* row 1 — brand + nav + actions */}
        <div className="flex h-16 items-center gap-4">
          <Link href="/" className="group flex shrink-0 items-center gap-2.5">
            <Image
              src="/brand/dealsense-icon.png"
              alt="DealSense"
              width={34}
              height={34}
              priority
              className="h-8.5 w-8.5 rounded-[10px] transition-transform duration-300 group-hover:scale-105"
            />
            <span className="text-[19px] font-extrabold tracking-[-0.02em] text-headline">
              Deal<span className="text-gradient-brand">Sense</span>
            </span>
          </Link>

          <nav className="ml-3 hidden items-center gap-1 lg:flex">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="rounded-lg px-3.5 py-2 text-[13.5px] font-semibold text-body transition-colors hover:bg-elevated hover:text-headline"
              >
                {l.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <Link
              href="/track"
              aria-label="Alerts"
              className="relative grid h-9 w-9 place-items-center rounded-full border border-hairline text-body transition-colors hover:text-headline"
            >
              <Bell className="h-4 w-4" />
              <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-brand-500" />
            </Link>
            <ThemeToggle />
            <Link
              href="/analyze"
              className="hidden h-9 items-center rounded-full bg-gradient-iris px-4 text-[12.5px] font-bold text-white shadow-[0_8px_22px_-10px_rgba(99,102,241,0.9)] transition-transform hover:-translate-y-0.5 sm:inline-flex"
            >
              Check a deal
            </Link>
            <button
              className="grid h-9 w-9 place-items-center rounded-lg border border-hairline text-body lg:hidden"
              onClick={() => setOpen((v) => !v)}
              aria-label="Menu"
            >
              {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* row 2 — the big search bar (Buyhatke style) */}
        <form onSubmit={submit} className="hidden pb-3 md:block">
          <div className="flex h-12 items-center gap-3 rounded-2xl border border-hairline bg-subtle px-4 transition-colors focus-within:border-iris-400/50 focus-within:bg-card focus-within:shadow-[0_0_0_4px_rgba(99,102,241,0.10)]">
            <Search className="h-4.5 w-4.5 shrink-0 text-muted" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search for any product or paste any Amazon / Flipkart link"
              className="h-full min-w-0 flex-1 bg-transparent text-[14px] text-headline placeholder:text-muted focus:outline-none"
              autoComplete="off"
              spellCheck={false}
            />
            <span className="hidden items-center gap-1.5 text-[11.5px] font-semibold text-muted lg:flex">
              supports
              {STORES.map((s) => (
                <span
                  key={s.label}
                  title={s.label}
                  className="grid h-5 w-5 place-items-center rounded text-[8px] font-black"
                  style={{ background: s.bg, color: s.fg }}
                >
                  {s.short}
                </span>
              ))}
            </span>
            <span className="h-5 w-px bg-hairline" />
            <button type="button" aria-label="Voice search" className="text-muted hover:text-headline">
              <Mic className="h-4 w-4" />
            </button>
            <button
              type="submit"
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-gradient-brand px-4 text-[12.5px] font-extrabold text-[#04140d] transition-transform hover:-translate-y-0.5"
            >
              Find best deals
            </button>
          </div>
        </form>

        {open && (
          <div className="border-t border-hairline bg-[var(--bg-header)] py-3 backdrop-blur-xl lg:hidden">
            <form onSubmit={submit} className="pb-2">
              <div className="flex h-11 items-center gap-2 rounded-xl border border-hairline bg-subtle px-3">
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
                className="block rounded-lg px-3 py-2.5 text-sm font-semibold text-body hover:bg-elevated hover:text-headline"
              >
                {l.label}
              </Link>
            ))}
          </div>
        )}
      </Container>
    </header>
  );
}
