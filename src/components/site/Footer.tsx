import Link from "next/link";
import { Container } from "@/components/ui/Container";

export function Footer() {
  return (
    <footer className="relative mt-24 border-t border-line">
      <Container size="wide" className="py-14">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <div className="text-lg font-extrabold tracking-tight">
              Deal<span className="gradient-text">Sense</span>
            </div>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-ink-muted">
              India&apos;s shopping decision engine. Real price history, true landed cost and an
              honest verdict — before you buy.
            </p>
          </div>

          <FooterCol
            title="Product"
            links={[
              { href: "/analyze", label: "Analyze a link" },
              { href: "/deals", label: "Live deals" },
              { href: "/#how", label: "How it works" },
              { href: "/#faq", label: "FAQ" },
            ]}
          />
          <FooterCol
            title="Stores"
            links={[
              { href: "/analyze", label: "Amazon India" },
              { href: "/analyze", label: "Flipkart" },
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

        <div className="mt-12 flex flex-col gap-3 border-t border-line pt-6 text-xs text-ink-muted sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} DealSense. Prices verified live; always confirm on the store.</p>
          <p>
            As an affiliate, DealSense may earn a commission from qualifying purchases — at no extra
            cost to you.
          </p>
        </div>      </Container>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: { href: string; label: string }[] }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wider text-ink-muted">{title}</div>
      <ul className="mt-4 space-y-2.5">
        {links.map((l) => (
          <li key={l.label}>
            <Link href={l.href} className="text-sm text-ink-soft transition-colors hover:text-ink">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
