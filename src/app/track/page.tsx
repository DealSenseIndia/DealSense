import type { Metadata } from "next";
import Link from "next/link";
import { Bell, Search } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { ButtonLink } from "@/components/ui/Button";
import { listAlerts } from "@/lib/db/queries";
import { formatINR, timeAgo } from "@/lib/utils";
import { Tag } from "@/components/ui/Badge";

export const metadata: Metadata = {
  title: "Track prices",
  description: "Your DealSense price alerts — products you are watching for a price drop.",
  alternates: { canonical: "/track" },
};

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "brand" | "amber" | "blue" | "red" | "neutral"> = {
  ARMED: "brand",
  COOLDOWN: "blue",
  TRIGGERED: "amber",
  PAUSED: "neutral",
  DISABLED: "red",
};

export default async function TrackPage() {
  const alerts = await listAlerts(100);

  return (
    <section className="relative py-12">
      <Container size="wide">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[30px] font-extrabold tracking-tight text-headline sm:text-[36px]">
              Your price alerts
            </h1>
            <p className="mt-2 text-[14.5px] text-body">
              Products you are watching. DealSense checks the live price and fires the moment your
              target is hit.
            </p>
          </div>
          <ButtonLink href="/analyze">
            <Search className="h-4 w-4" /> Track a new product
          </ButtonLink>
        </div>

        {alerts.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-dashed border-hairline bg-subtle p-12 text-center">
            <div className="grid h-14 w-14 mx-auto place-items-center rounded-2xl bg-[var(--dw-green-surface)] text-[var(--dw-green-mid)]">
              <Bell className="h-6 w-6" />
            </div>
            <h3 className="mt-4 text-lg font-extrabold text-headline">No alerts yet</h3>
            <p className="mx-auto mt-2 max-w-md text-[13.5px] text-body">
              Open any product, set your target price, and we&apos;ll watch it for you — on Telegram or
              email.
            </p>
            <ButtonLink href="/deals" className="mt-6">
              Browse live deals
            </ButtonLink>
          </div>
        ) : (
          <div className="mt-8 overflow-hidden rounded-2xl border border-hairline bg-card shadow-card">
            <div className="divide-y divide-[var(--border-subtle)]">
              {alerts.map((a) => (
                <div key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5">
                  <Tag tone={STATUS_TONE[a.status] ?? "neutral"}>{a.status}</Tag>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] font-extrabold text-headline">
                      {a.alertType.replace(/_/g, " ")}
                    </div>
                    <div className="text-[11.5px] text-muted">
                      Target {formatINR(a.targetPrice ?? a.baselinePrice)} · {a.channel}
                      {a.triggerCount > 0 && ` · fired ${a.triggerCount}×`}
                    </div>
                  </div>
                  {a.lastTriggeredAt && (
                    <span className="text-[11.5px] font-semibold text-secondary">
                      last {timeAgo(a.lastTriggeredAt)}
                    </span>
                  )}
                  <Link
                    href={`/analyze?url=${encodeURIComponent(a.listingId)}`}
                    className="text-[12px] font-bold text-[var(--dw-green-mid)] hover:underline"
                  >
                    View
                  </Link>
                </div>
              ))}
            </div>
          </div>
        )}
      </Container>
    </section>
  );
}
