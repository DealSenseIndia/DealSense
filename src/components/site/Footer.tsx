import Link from "next/link";
import Image from "next/image";
import { Container } from "@/components/ui/Container";

export function Footer() {
  return (
    <footer className="relative border-t border-hairline bg-subtle">
      <Container size="wide" className="py-12">
        <div className="grid gap-9 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-2.5">
              <Image
                src="/brand/dealsense-icon.png"
                alt="DealSense"
                width={32}
                height={32}
                className="h-8 w-8 rounded-[9px]"
              />
              <span className="text-[17px] font-extrabold tracking-tight text-headline">
                Deal<span className="text-gradient-brand">Sense</span>
              </span>
            </div>
            <p className="mt-3 max-w-xs text-[13px] leading-relaxed text-secondary">
              India&apos;s shopping decision engine. Real price history, true landed cost and an honest
              verdict — before you buy.
            </p>
            <div className="mt-4 flex items-center gap-2">
              {[
                { l: "Amazon", s: "a", bg: "#FF9900", fg: "#000" },
                { l: "Flipkart", s: "f", bg: "#2874F0", fg: "#fff" },
                { l: "Croma", s: "C", bg: "#00A0E9", fg: "#fff" },
                { l: "Myntra", s: "M", bg: "#FF3F6C", fg: "#fff" },
              ].map((s) => (
                <span
                  key={s.l}
                  title={s.l}
                  className="grid h-7 w-7 place-items-center rounded-lg text-[9px] font-black"
                  style={{ background: s.bg, color: s.fg }}
                >
                  {s.s}
                </span>
              ))}
            </div>
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
            title="Track"
            links={[
              { href: "/track", label: "Your alerts" },
              { href: "/search?q=iphone", label: "iPhone prices" },
              { href: "/search?q=laptop", label: "Laptop prices" },
              { href: "/search?q=tv", label: "TV prices" },
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
            <Link
              href={l.href}
              className="text-[13px] font-semibold text-body transition-colors hover:text-[var(--dw-green-mid)]"
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
