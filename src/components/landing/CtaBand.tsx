import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { GeminiIcon } from "@/components/ui/GeminiIcon";

/**
 * Closing band — the shopping-bags artwork with one clear next step.
 * Deliberately light: one headline, one line, one button.
 */
export function CtaBand() {
  return (
    <section className="py-14">
      <Container size="wide">
        <div className="relative overflow-hidden rounded-[28px] border border-hairline bg-[linear-gradient(135deg,#ECFDF5_0%,#D9F7E8_45%,#C6EFD9_100%)] shadow-card dark:bg-[linear-gradient(135deg,#052B20_0%,#063A2A_50%,#04211A_100%)]">
          {/* the artwork sits on the right and melts into the band */}
          <Image
            src="/brand/shopping-bags.png"
            alt=""
            aria-hidden
            width={1672}
            height={941}
            className="pointer-events-none absolute -bottom-10 -right-8 w-[420px] max-w-[46%] opacity-95 select-none max-md:hidden"
          />

          <div className="relative max-w-xl px-7 py-12 sm:px-12 sm:py-16">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-600/25 bg-white/70 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-emerald-700 dark:border-emerald-400/25 dark:bg-white/5 dark:text-emerald-300">
              <Sparkles className="h-3 w-3" />
              Free · no signup
            </span>

            <h2 className="mt-4 text-[30px] font-extrabold leading-[1.1] tracking-[-0.03em] text-[#063D2B] sm:text-[40px] dark:text-slate-50">
              Stop guessing what
              <br />
              it should cost.
            </h2>

            <p className="mt-3 max-w-md text-[14.5px] leading-relaxed text-[#0F5138] dark:text-slate-300">
              Paste a link from Amazon, Flipkart, Myntra, Nykaa or any other store we track. We
              read the real price, check it against every price in our record, and tell you
              whether now is a good time to buy.
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link
                href="/analyze"
                className="btn-cta inline-flex h-12 items-center gap-2 rounded-xl px-6 font-extrabold"
              >
                <GeminiIcon className="h-4 w-4" />
                Analyze a product link
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/deals"
                className="inline-flex h-12 items-center rounded-xl border border-emerald-700/20 bg-white/70 px-6 text-[13.5px] font-extrabold text-[#063D2B] transition-all hover:-translate-y-0.5 hover:border-emerald-600/40 dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
              >
                Browse live deals
              </Link>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
