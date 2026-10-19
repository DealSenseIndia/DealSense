import Link from "next/link";
import { Container } from "@/components/ui/Container";

export function Footer() {
  return (
    <footer className="relative border-t border-hairline bg-subtle">
      <Container size="wide" className="py-12">
        <div className="grid gap-9 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-accent text-white">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 15l5-5 4 4 7-7" />
                  <path d="M20 7h-5m5 0v5" />
                </svg>
              </span>
              <span className="text-[16px] font-extrabold tracking-tight text-headline">
                Deal<span className="text-emerald-accent">Sense</span>
              </span>
            </div>
            <p className="mt-3 max-w-xs text-[13px] leading-relaxed text-secondary">
              India&apos;s shopping decision engine. Real price history, true landed cost and an honest
              verdict — before you buy.
            </p>
          </div>

          <FooterCol
            title="Product"
            links={[
              { href: "/analyze", label: "Analyze a link" },
              { href: "/deals", label: "Live deals" },
              { href: "/price-history", label: "Price history" },
              { href: "/categories", label: "Categories" },
            ]}
          />
          <FooterCol
            title="Stores"
            links={[
              { href: "/search?q=amazon+deals", label: "Amazon India" },
              { href: "/search?q=flipkart+deals", label: "Flipkart" },
              { href: "/track", label: "Track prices" },
            ]}
          />
          <FooterCol
            title="Legal"
            links={[
              { href: "/disclosure", label: "Affiliate disclosure" },
              { href: "/privacy", label: "Privacy" },
            ]}
          />
        </div>

        <div className="mt-10 flex flex-col gap-2 border-t border-hairline pt-6 text-[11.5px] text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} DealSense. Prices verified live; always confirm on the store.</p>
          <p>
            As an affiliate, DealSense may earn a commission from qualifying purchases — at no extra
            cost to you.
          </p>
        </div>
      </Container>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: { href: string; label: string }[] }) {
  return (
    <div>
      <div className="text-[11px] font-extrabold uppercase tracking-wider text-muted">{title}</div>
      <ul className="mt-3.5 space-y-2">
        {links.map((l) => (
          <li key={l.label}>
            <Link href={l.href} className="text-[13px] font-semibold text-body transition-colors hover:text-[var(--dw-green-mid)]">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
