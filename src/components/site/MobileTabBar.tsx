"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, Search, Sparkles, Tag, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/deals", label: "Deals", icon: Tag },
  { href: "/live", label: "Live", icon: Zap },
  { href: "/setups", label: "Setups", icon: LayoutGrid },
  { href: "/search", label: "Search", icon: Search },
  { href: "/analyze", label: "Analyze", icon: Sparkles, primary: true },
];

/**
 * App-style bottom navigation for phones.
 *
 * The top bar still carries the brand, alerts and theme; this is the primary
 * thumb reach. It floats over the page with the safe-area inset respected, and
 * the layout gives the body enough bottom padding that the footer is never
 * hidden behind it.
 */
export function MobileTabBar() {
  const pathname = usePathname();

  return (
    <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-40 lg:hidden">
      <div className="mx-auto w-full max-w-[560px] px-3 pb-[max(10px,env(safe-area-inset-bottom))]">
        <div className="nav-shell flex items-center justify-between gap-0.5 rounded-2xl border border-hairline px-1.5 py-1.5 shadow-[0_-12px_40px_-24px_rgba(6,95,70,0.45)] backdrop-blur-xl backdrop-saturate-150">
          {items.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-xl px-0.5 py-1 text-[9px] font-extrabold transition-all active:scale-[0.94]",
                  active
                    ? "text-[var(--dw-green-mid)]"
                    : item.primary
                      ? "text-[var(--dw-green-mid)]"
                      : "text-muted",
                )}
              >
                <span
                  className={cn(
                    "grid h-7 w-7 place-items-center rounded-lg transition-colors",
                    active || item.primary ? "bg-[var(--dw-green-surface)]" : "",
                  )}
                >
                  <Icon className="h-[16px] w-[16px]" aria-hidden />
                </span>
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
