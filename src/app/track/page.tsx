import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ChevronRight, Plus } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { PageSearch } from "@/components/site/PageSearch";
import { listAlerts } from "@/lib/db/queries";
import { formatINR, timeAgo } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Track prices",
  description: "Your DealSense price alerts — products you are watching for a price drop.",
  alternates: { canonical: "/track" },
};

export const dynamic = "force-dynamic";

const STATUS: Record<string, { cls: string; label: string }> = {
  ARMED: { cls: "border-emerald-400/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300", label: "Armed" },
  COOLDOWN: { cls: "border-sky-400/40 bg-sky-500/10 text-sky-600 dark:text-sky-300", label: "Cooldown" },
  TRIGGERED: { cls: "border-amber-400/40 bg-amber-500/10 text-amber-600 dark:text-amber-300", label: "Triggered" },
  PAUSED: { cls: "border-hairline bg-elevated text-secondary", label: "Paused" },
  DISABLED: { cls: "border-hairline bg-elevated text-muted", label: "Disabled" },
};

export default async function TrackPage() {
  const alerts = await listAlerts(100);

  return (
    <section className="relative py-8">
      <Container size="wide">
        <nav className="flex items-center gap-1.5 text-[12.5px] font-semibold text-muted">
          <Link href="/" className="text-[var(--dw-green-mid)] hover:underline">
            Home
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span>Track</span>
        </nav>

        <div className="mt-4 flex flex-wrap items-end justify-between gap-6">
          <div>
            <h1 className="text-[30px] font-extrabold tracking-[-0.03em] text-headline sm:text-[40px]">
              Your <span className="text-gradient-brand">Alerts</span>
            </h1>
            <p className="mt-2 max-w-xl text-[14.5px] leading-relaxed text-body">
              We check the live price and message you the moment your target is hit.
            </p>
          </div>
          <PageSearch className="w-full max-w-md" placeholder="Paste a link to start tracking…" />
        </div>

        {alerts.length === 0 ? (
          <div className="mt-9 overflow-hidden rounded-3xl border border-dashed border-hairline bg-subtle p-10 text-center sm:p-14">
            <Image
              src="/brand/shopping-bags.png"
              alt=""
              aria-hidden
              width={1672}
              height={941}
              className="mx-auto h-40 w-auto max-w-[260px] object-contain opacity-95"
            />
            <h2 className="mt-6 text-lg font-extrabold text-headline">No alerts yet</h2>
            <p className="mx-auto mt-2 max-w-md text-[13.5px] text-body">
              Open any product, set your target price, and we&apos;ll watch it — on Telegram or email.
            </p>
            <Link
              href="/deals"
              className="mt-6 inline-flex h-10 items-center gap-1.5 rounded-xl bg-gradient-brand px-5 text-[12.5px] font-extrabold text-white"
            >
              <Plus className="h-3.5 w-3.5" /> Browse products
            </Link>
          </div>
        ) : (
          <div className="mt-8 overflow-hidden rounded-2xl border border-hairline bg-card shadow-card">
            <div className="divide-y divide-[var(--border-subtle)]">
              {alerts.map((a) => {
                const st = STATUS[a.status] ?? STATUS.PAUSED;
                return (
                  <div key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5">
                    <span
                      className={`rounded-full border px-2.5 py-1 text-[10.5px] font-extrabold ${st.cls}`}
                    >
                      {st.label}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-extrabold text-headline">
                        {a.alertType.replace(/_/g, " ").toLowerCase()}
                      </div>
                      <div className="text-[11.5px] text-muted">
                        Target {formatINR(a.targetPrice ?? a.baselinePrice)} · {a.channel}
                        {a.triggerCount > 0 && ` · fired ${a.triggerCount}×`}
                      </div>
                    </div>
                    {a.lastTriggeredAt && (
                      <span className="text-[11.5px] font-semibold text-secondary">
                        {timeAgo(a.lastTriggeredAt)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Container>
    </section>
  );
}
