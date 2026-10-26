"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Bell, Menu, X } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { GeminiIcon } from "@/components/ui/GeminiIcon";
import { ThemeToggle } from "./ThemeToggle";
import { cn } from "@/lib/utils";

const links = [
  { href: "/deals", label: "Deals" },
  { href: "/setups", label: "Smart Setups" },
  { href: "/categories", label: "Categories" },
  { href: "/price-history", label: "History" },
  { href: "/track", label: "Track" },
];

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

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
      <Container size="wide">
        <div className="flex h-16 items-center gap-3">
          <Link href="/" className="group flex shrink-0 items-center gap-2.5">
            <Image
              src="/brand/dealsense-icon.png"
              alt="DealSense"
              width={34}
              height={34}
              priority
              className="h-8.5 w-8.5 rounded-[10px] transition-transform duration-300 group-hover:scale-105"
            />
            <span className="leading-none">
              <span className="block text-[19px] font-extrabold tracking-[-0.02em] text-headline">
                Deal<span className="text-gradient-brand">Sense</span>
              </span>
              <span className="mt-0.5 hidden text-[10px] font-semibold text-muted sm:block">
                Shop smarter. Save more.
              </span>
            </span>
          </Link>

          <nav className="ml-2 hidden items-center gap-0.5 lg:flex">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="rounded-lg px-3 py-2 text-[13.5px] font-semibold text-body transition-colors hover:bg-elevated hover:text-headline"
              >
                {l.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1.5">
            <Link
              href="/analyze"
              aria-label="Analyze a link"
              title="Analyze a link"
              className="grid h-9 w-9 place-items-center rounded-lg border border-hairline text-body transition-colors hover:border-emerald-400/50 hover:text-headline"
            >
              <GeminiIcon className="h-4 w-4" />
            </Link>
            <Link
              href="/track"
              aria-label="Alerts"
              title="Alerts"
              className="relative grid h-9 w-9 place-items-center rounded-lg border border-hairline text-body transition-colors hover:border-emerald-400/50 hover:text-headline"
            >
              <Bell className="h-4 w-4" />
              <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-emerald-500" />
            </Link>
            <ThemeToggle />
            <Link
              href="/analyze"
              className="btn-cta hidden h-9 items-center gap-1.5 rounded-lg px-4 text-[12.5px] font-extrabold sm:inline-flex"
            >
              <GeminiIcon className="h-3.5 w-3.5" />
              Analyze
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
      </Container>

      {open && (
        <div className="border-t border-hairline bg-[var(--bg-header)] py-2 backdrop-blur-xl lg:hidden">
          <Container className="flex flex-col">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-2 py-2.5 text-sm font-semibold text-body hover:bg-elevated hover:text-headline"
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
