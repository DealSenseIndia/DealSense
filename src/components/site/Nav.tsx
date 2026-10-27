"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Bell, BellRing, BookOpen, LayoutGrid, Menu, Search, Shapes, Tag, TrendingUp, X } from "lucide-react";
import { GeminiIcon } from "@/components/ui/GeminiIcon";
import { ThemeToggle } from "./ThemeToggle";
import { cn } from "@/lib/utils";

const links = [
  { href: "/deals", label: "Deals", icon: Tag },
  { href: "/setups", label: "Smart Setups", icon: LayoutGrid },
  { href: "/blog", label: "Journal", icon: BookOpen },
  { href: "/categories", label: "Categories", icon: Shapes },
  { href: "/price-history", label: "History", icon: TrendingUp },
  { href: "/track", label: "Track", icon: BellRing },
];

const isActive = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(`${href}/`);

/**
 * Floating glass nav with a gradient that travels around its border (the
 * "nova" frame). One analyse CTA, not three: the icon duplicate that used to
 * sit beside it is gone, and the search lives in a field-like trigger so the
 * bar reads as a tool rather than a list of links.
 */
export function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // "/" jumps to search from anywhere that is not already a text field.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement;
      const typing =
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        (el instanceof HTMLElement && el.isContentEditable);
      if (typing) return;
      e.preventDefault();
      router.push("/search");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <header className="sticky top-0 z-50 px-3 pb-1 pt-2.5 sm:px-4 sm:pt-3">
      {/* The floating bar sits a few pixels down from the edge; without this
          scrim the page scrolls visibly through that strip. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[104px]"
        style={{
          background:
            "linear-gradient(to bottom, var(--bg-pure) 0%, var(--bg-pure) 58%, transparent 100%)",
        }}
      />
      <div
        className={cn(
          "nova-frame relative mx-auto w-full max-w-[1400px]",
          scrolled
            ? "shadow-[0_22px_60px_-28px_rgba(6,95,70,0.6)]"
            : "shadow-[0_12px_44px_-30px_rgba(6,95,70,0.45)]",
        )}
      >
        <div className="nav-shell nova-inner overflow-hidden rounded-[19px] backdrop-blur-xl backdrop-saturate-150">
          <div
            className={cn(
              "relative flex items-center gap-1.5 px-2.5 transition-[height] duration-300",
              scrolled ? "h-[54px]" : "h-[60px]",
            )}
          >
            <Link href="/" className="group flex shrink-0 items-center gap-2.5 pr-1">
              <Image
                src="/brand/dealsense-icon.png"
                alt="DealSense"
                width={32}
                height={32}
                priority
                className="h-8 w-8 rounded-[9px] transition-transform duration-300 group-hover:scale-105"
              />
              <span className="leading-none">
                <span className="block text-[18px] font-extrabold tracking-[-0.02em] text-headline">
                  Deal<span className="text-gradient-brand">Sense</span>
                </span>
                <span className="mt-0.5 hidden text-[9.5px] font-semibold text-muted sm:block">
                  Shop smarter. Save more.
                </span>
              </span>
            </Link>

            <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-0.5 lg:flex">
              {links.map((l) => {
                const active = isActive(pathname, l.href);
                const Icon = l.icon;
                return (
                  <Link
                    key={l.href}
                    href={l.href}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[12.5px] font-semibold transition-colors",
                      active
                        ? "bg-[var(--dw-green-surface)] text-[var(--dw-green-mid)]"
                        : "text-body hover:bg-elevated hover:text-headline",
                    )}
                  >
                    <Icon
                      className={cn("h-3.5 w-3.5", active ? "opacity-100" : "opacity-60")}
                      aria-hidden
                    />
                    {l.label}
                  </Link>
                );
              })}
            </nav>

            <div className="ml-auto flex items-center gap-1">
              <Link
                href="/search"
                className="hidden h-9 items-center gap-2 rounded-xl border border-hairline bg-subtle/60 px-2.5 text-[11.5px] font-semibold text-muted transition-colors hover:border-emerald-400/40 hover:text-headline md:flex"
              >
                <Search className="h-3.5 w-3.5" />
                <span className="hidden xl:inline">Search products</span>
                <kbd className="ml-0.5 hidden rounded-md border border-hairline bg-card px-1.5 py-0.5 text-[9px] font-bold text-muted xl:inline">
                  /
                </kbd>
              </Link>

              <Link
                href="/track"
                aria-label="Alerts"
                title="Alerts"
                className="relative grid h-9 w-9 place-items-center rounded-xl border border-hairline bg-card/60 text-body transition-colors hover:border-emerald-400/50 hover:text-headline"
              >
                <Bell className="h-4 w-4" />
                <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-emerald-500" />
              </Link>

              <ThemeToggle />

              <Link
                href="/analyze"
                className="btn-cta hidden h-9 items-center gap-1.5 px-3.5 text-[12px] font-extrabold sm:inline-flex"
              >
                <GeminiIcon className="h-3.5 w-3.5" />
                Analyze
              </Link>

              <button
                className="grid h-9 w-9 place-items-center rounded-xl border border-hairline bg-card/60 text-body transition-colors hover:text-headline lg:hidden"
                onClick={() => setOpen((v) => !v)}
                aria-label="Menu"
                aria-expanded={open}
              >
                {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {open && (
            <div className="border-t border-hairline px-2.5 pb-3 pt-2 lg:hidden">
              <div className="grid grid-cols-2 gap-1">
                {links.map((l) => {
                  const active = isActive(pathname, l.href);
                  const Icon = l.icon;
                  return (
                    <Link
                      key={l.href}
                      href={l.href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-[13px] font-semibold transition-colors",
                        active
                          ? "bg-[var(--dw-green-surface)] text-[var(--dw-green-mid)]"
                          : "text-body hover:bg-elevated hover:text-headline",
                      )}
                    >
                      <Icon className={cn("h-4 w-4", active ? "opacity-100" : "opacity-60")} aria-hidden />
                      {l.label}
                    </Link>
                  );
                })}
              </div>
              <div className="mt-2 flex gap-2">
                <Link
                  href="/search"
                  onClick={() => setOpen(false)}
                  className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-hairline bg-card text-[12.5px] font-extrabold text-secondary"
                >
                  <Search className="h-3.5 w-3.5" /> Search
                </Link>
                <Link
                  href="/analyze"
                  onClick={() => setOpen(false)}
                  className="btn-cta inline-flex h-10 flex-1 items-center justify-center gap-1.5 text-[12.5px] font-extrabold"
                >
                  <GeminiIcon className="h-3.5 w-3.5" /> Analyze
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
