"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Copy,
  Layers,
  MessageCircle,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TrendingDown,
} from "lucide-react";
import type { SetupBuildResult, SetupTierResult } from "@/lib/setups/engine";
import { SetupItemCard } from "./SetupItemCard";
import { SetupBundleModal } from "./SetupBundleModal";
import { cn, formatINR } from "@/lib/utils";

const SCORE_ROWS = [
  { key: "coverage", label: "Slot coverage", weight: 40, hint: "Essential slots actually filled." },
  {
    key: "budgetFit",
    label: "Budget fit",
    weight: 20,
    hint: "Full marks inside your budget; overspending is penalised.",
  },
  { key: "priceEvidence", label: "Price evidence", weight: 20, hint: "Share of items with enough recorded history." },
  { key: "dealQuality", label: "Deal quality", weight: 20, hint: "Mean deal score across evidenced items." },
] as const;

function reasonLabel(reason: string): string {
  if (reason === "NO_MATCHING_PRODUCT") return "Not tracked yet";
  if (reason === "OUT_OF_BUDGET_RANGE") return "No match in this price band";
  if (reason === "ONLY_POOR_DEALS") return "Only poor deals right now";
  if (reason === "COVERED_BY_PROCESSOR") return "Covered by the processor";
  return reason;
}

export function SetupResults({
  setup,
  tierKey,
  onTierChange,
  configDirty,
  shareUrl,
}: {
  setup: SetupBuildResult;
  tierKey: string;
  onTierChange: (key: string) => void;
  configDirty: boolean;
  shareUrl: string;
}) {
  const [bundleOpen, setBundleOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const tier =
    setup.tiers.find((t) => t.key === tierKey) ?? setup.tiers[1] ?? setup.tiers[0];

  const valueTier = setup.tiers.find((t) => t.key === "value");
  const premiumTier = setup.tiers.find((t) => t.key === "premium");
  const premiumIsSameBuild =
    valueTier && premiumTier && premiumTier.totalPrice === valueTier.totalPrice;

  const phase1 = useMemo(() => tier.items.filter((i) => i.phase === 1), [tier]);
  const phase2 = useMemo(() => tier.items.filter((i) => i.phase === 2), [tier]);

  /**
   * An open slot is not always a gap. When the processor covers the graphics
   * slot, saying "2 slots were left unfilled" would under-sell a build that
   * works, so covered slots are reported in their own honest voice.
   */
  const openGaps = tier.unfilled.filter((u) => u.reason !== "COVERED_BY_PROCESSOR");
  const coveredSlots = tier.unfilled.filter((u) => u.reason === "COVERED_BY_PROCESSOR");

  const whatsappText = `${setup.title} — ${tier.label} at ${formatINR(tier.totalPrice)}. ${tier.items.length} price-verified picks on DealSense: ${shareUrl}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard permission denied. The bundle modal still exposes the URL.
    }
  }

  return (
    <section id="setup-results" className="scroll-mt-24">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="inline-flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--dw-green-mid)]">
            <Sparkles className="h-3.5 w-3.5" /> Your composition
          </span>
          <h2 className="mt-1.5 text-[26px] font-extrabold tracking-[-0.03em] text-headline sm:text-[32px]">
            {setup.title}
          </h2>
          <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-secondary">
            {setup.tagline}
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-card px-3 py-1.5 text-[10.5px] font-bold text-secondary">
          <ShieldCheck className="h-3.5 w-3.5 text-[var(--dw-green-mid)]" />
          Every item is a real tracked listing
        </span>
      </div>

      {/* Tier selector */}
      <div
        role="tablist"
        aria-label="Budget tiers"
        className="mt-5 grid gap-2.5 sm:grid-cols-3"
      >
        {setup.tiers.map((t) => {
          const active = t.key === tier.key;
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={active}
              onClick={() => onTierChange(t.key)}
              className={cn(
                "group relative overflow-hidden rounded-xl border p-3.5 text-left transition-all duration-200",
                active
                  ? "border-emerald-400/60 bg-[var(--dw-green-surface)] shadow-[0_10px_30px_-18px_rgba(16,185,129,0.7)]"
                  : "border-hairline bg-card hover:border-emerald-400/35 hover:bg-elevated/60",
              )}
            >
              <span className="flex items-center justify-between gap-2">
                <span
                  className={cn(
                    "text-[13px] font-extrabold tracking-[-0.01em]",
                    active ? "text-[var(--dw-green-mid)]" : "text-headline",
                  )}
                >
                  {t.label}
                </span>
                <span
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[8.5px] font-extrabold uppercase tracking-[0.08em]",
                    active
                      ? "border-emerald-400/40 bg-card/70 text-[var(--dw-green-mid)]"
                      : "border-hairline bg-elevated text-muted",
                  )}
                >
                  {t.badge}
                </span>
              </span>
              <span className="mt-1 block text-[10.5px] leading-snug text-secondary">{t.tagline}</span>
              <span className="mt-2 flex items-center justify-between gap-2">
                <span className="tabular text-[11px] font-bold text-muted">
                  aims at {formatINR(t.effectiveBudget)}
                </span>
                <span className="tabular text-[11.5px] font-extrabold text-headline">
                  {formatINR(t.totalPrice)}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {premiumIsSameBuild && (
        <p className="mt-2 flex items-start gap-1.5 text-[10.5px] font-semibold leading-snug text-muted">
          <ShieldCheck className="mt-px h-3.5 w-3.5 shrink-0 text-[var(--dw-green-mid)]" />
          Step up landed on the same picks today. No tracked upgrade was worth the extra spend, so
          we did not pad the build.
        </p>
      )}

      {/* Picks that are honest but expensive right now */}
      {tier.cautionCount > 0 && (
        <div className="mt-3 flex items-start gap-3 rounded-xl border border-red-400/30 bg-red-500/[0.06] px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
          <div className="min-w-0 text-[11.5px] leading-relaxed text-secondary">
            <strong className="font-extrabold text-red-700 dark:text-red-300">
              {tier.cautionCount} {tier.cautionCount === 1 ? "pick is" : "picks are"} priced above
              what DealSense usually records
            </strong>
            <div className="mt-0.5">
              Those slots stay in the build because the room does not work without them, and every
              option we track in them is currently Avoid-rated. Each card shows its own recorded low
              and typical price — buy them last, or wait for the drop.
            </div>
          </div>
        </div>
      )}

      {configDirty && (
        <div className="mt-3 flex items-center gap-2 rounded-xl border border-amber-400/30 bg-amber-500/[0.07] px-3 py-2 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
          <RefreshCw className="h-3.5 w-3.5 shrink-0" />
          Your selections changed. Generate again to rebuild this setup from current prices.
        </div>
      )}

      {/* Summary */}
      <div className="relative mt-4 overflow-hidden rounded-card border border-hairline bg-card shadow-card">
        <div className="h-[3px] w-full bg-gradient-brand" />
        <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <SummaryStat label="Total setup cost" value={formatINR(tier.totalPrice)} tone="brand" />
              <SummaryStat
                label="Below listed MRP"
                value={tier.savingsVsMrp ? formatINR(tier.savingsVsMrp) : "—"}
              />
              <SummaryStat
                label={`Remaining of ${formatINR(setup.requestedBudget)}`}
                value={formatINR(tier.budgetRemaining)}
                tone={tier.budgetRemaining < 0 ? "red" : "default"}
                hint={tier.budgetRemaining < 0 ? "Over your budget at this tier" : undefined}
              />
              <SummaryStat
                label="Slot coverage"
                value={`${tier.completeness.filled}/${tier.completeness.slotsTotal}`}
                hint={`${tier.completeness.essentialFilled}/${tier.completeness.essentialTotal} essentials`}
              />
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[10.5px] font-semibold text-muted">
              <span className="inline-flex items-center gap-1">
                <Layers className="h-3 w-3" />
                {tier.storeCount} {tier.storeCount === 1 ? "store" : "stores"}
              </span>
              <span aria-hidden>·</span>
              <span>{tier.items.length} verified picks</span>
              {tier.completeness.withHistory > 0 && (
                <>
                  <span aria-hidden>·</span>
                  <span>{tier.completeness.withHistory} with confident history</span>
                </>
              )}
              <span aria-hidden>·</span>
              <span>Phase 1 {formatINR(tier.phase1Total)} / Phase 2 {formatINR(tier.phase2Total)}</span>
            </div>
          </div>

          <div className="flex items-center gap-4 rounded-xl border border-hairline-soft bg-subtle px-4 py-3 lg:min-w-[190px]">
            <ScoreRing score={tier.setupScore} />
            <div>
              <div className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-muted">
                Setup score
              </div>
              <div className="mt-0.5 text-[11px] leading-snug text-secondary">
                {tier.setupScore === null
                  ? "Not scored — nothing real to score yet."
                  : "Coverage, budget fit, evidence and deal quality."}
              </div>
              <div className="mt-1 text-[9px] font-bold text-muted">Formula below, 40/20/20/20</div>
            </div>
          </div>
        </div>

        {tier.scoreBreakdown && (
          <details className="group border-t border-hairline-soft">
            <summary className="flex cursor-pointer items-center justify-between px-4 py-2.5 text-[10.5px] font-bold text-secondary hover:text-headline sm:px-5">
              Score breakdown — auditable, weighted, no hidden factors
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
            </summary>
            <div className="grid gap-2.5 border-t border-hairline-soft bg-subtle px-4 py-4 sm:grid-cols-2 sm:px-5">
              {SCORE_ROWS.map((row) => {
                const value = tier.scoreBreakdown
                  ? (tier.scoreBreakdown[row.key] as number)
                  : 0;
                return (
                  <div key={row.key} className="rounded-lg border border-hairline bg-card px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10.5px] font-extrabold text-headline">{row.label}</span>
                      <span className="tabular text-[10px] font-bold text-secondary">
                        {Math.round(value * row.weight)}/{row.weight} pts
                      </span>
                    </div>
                    <div
                      className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-elevated"
                      role="progressbar"
                      aria-valuenow={Math.round(value * 100)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={row.label}
                    >
                      <div
                        className="h-full rounded-full bg-gradient-brand"
                        style={{ width: `${Math.max(0, Math.min(100, value * 100))}%` }}
                      />
                    </div>
                    <div className="mt-1 text-[9.5px] leading-snug text-muted">{row.hint}</div>
                  </div>
                );
              })}
              <p className="text-[9.5px] leading-relaxed text-muted sm:col-span-2">
                {tier.scoreBreakdown.note}
              </p>
            </div>
          </details>
        )}
      </div>

      {/* Owned-items guard */}
      {setup.owned.count > 0 && (
        <div className="mt-3 flex items-start gap-3 rounded-xl border border-emerald-400/30 bg-[var(--dw-green-surface)] px-4 py-3">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--dw-green-mid)]" />
          <div className="min-w-0 text-[11.5px] leading-relaxed text-secondary">
            <strong className="font-extrabold text-headline">
              Trust Guard: {setup.owned.count} {setup.owned.count === 1 ? "item" : "items"} kept out
            </strong>
            <div className="mt-0.5">
              You already own: {setup.owned.labels.join(", ")}. We did not estimate what you paid
              for them; we simply removed those slots and redistributed their budget share.
            </div>
          </div>
        </div>
      )}

      {/* Honest gaps */}
      {openGaps.length > 0 && (
        <div className="mt-3 rounded-xl border border-amber-400/30 bg-amber-500/[0.06] px-4 py-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-300" />
            <span className="text-[11.5px] font-extrabold text-amber-800 dark:text-amber-200">
              {openGaps.length} {openGaps.length === 1 ? "slot was" : "slots were"} left unfilled —
              not estimated
            </span>
          </div>
          <p className="mt-1 text-[10.5px] leading-relaxed text-secondary">
            A setup is only shown with products DealSense actually tracks at a recorded price. Here
            is what is missing and why.
          </p>
          <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {openGaps.map((u) => (
              <li
                key={u.slotKey}
                className="rounded-lg border border-hairline bg-card/80 px-2.5 py-1.5 text-[10px]"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-extrabold text-headline">{u.slotLabel}</span>
                  <span className="shrink-0 rounded-full border border-amber-400/30 bg-amber-500/10 px-1.5 py-0.5 text-[8px] font-extrabold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                    {reasonLabel(u.reason)}
                  </span>
                </div>
                <div className="mt-0.5 text-[9.5px] leading-relaxed text-muted">{u.detail}</div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Slots that are open because the build does not need them */}
      {coveredSlots.length > 0 && (
        <div className="mt-3 rounded-xl border border-emerald-400/30 bg-[var(--dw-green-surface)] px-4 py-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-3.5 w-3.5 text-[var(--dw-green-mid)]" />
            <span className="text-[11.5px] font-extrabold text-headline">
              {coveredSlots.length === 1 ? "One slot is" : "Some slots are"} open because nothing
              needs to be bought there
            </span>
          </div>
          <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {coveredSlots.map((u) => (
              <li
                key={u.slotKey}
                className="rounded-lg border border-hairline bg-card/80 px-2.5 py-1.5 text-[10px]"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-extrabold text-headline">{u.slotLabel}</span>
                  <span className="shrink-0 rounded-full border border-[var(--dw-green-mid)]/35 bg-[var(--dw-green-mid)]/10 px-1.5 py-0.5 text-[8px] font-extrabold uppercase tracking-wider text-[var(--dw-green-mid)]">
                    {reasonLabel(u.reason)}
                  </span>
                </div>
                <div className="mt-0.5 text-[9.5px] leading-relaxed text-muted">{u.detail}</div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tier.items.length === 0 ? (
        <div className="mt-4 rounded-card border border-dashed border-hairline-strong bg-subtle p-10 text-center">
          <TrendingDown className="mx-auto h-8 w-8 text-muted" />
          <h3 className="mt-3 text-[16px] font-extrabold text-headline">
            Nothing tracked fits this tier yet
          </h3>
          <p className="mx-auto mt-1 max-w-md text-[12px] leading-relaxed text-secondary">
            Try a different tier, raise the budget, or remove owned-item filters. We would rather
            show you a gap than invent a product or price.
          </p>
        </div>
      ) : (
        <>
          {phase1.length > 0 && (
            <div className="mt-8">
              <PhaseHeader
                phase={1}
                title="Buy first"
                subtitle="The essentials this space does not work without."
                total={tier.phase1Total}
                count={phase1.length}
              />
              <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {phase1.map((item) => (
                  <SetupItemCard key={item.listingId} item={item} />
                ))}
              </div>
            </div>
          )}

          {phase2.length > 0 && (
            <div className="mt-8">
              <PhaseHeader
                phase={2}
                title="Add later"
                subtitle="Finishing pieces you can spread across paydays."
                total={tier.phase2Total}
                count={phase2.length}
              />
              <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {phase2.map((item) => (
                  <SetupItemCard key={item.listingId} item={item} />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Action bar */}
      <div className="relative mt-8 overflow-hidden rounded-card border border-emerald-900/20 bg-[linear-gradient(120deg,#052e22_0%,#064e3b_58%,#065f46_100%)] p-5 text-white shadow-lift sm:p-6">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-12 -top-16 h-52 w-52 rounded-full bg-emerald-400/15 blur-3xl"
        />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-emerald-300/80">
              {setup.space.replaceAll("_", " ")} · {tier.label}
            </div>
            <div className="mt-1 flex flex-wrap items-baseline gap-2">
              <span className="tabular text-[28px] font-extrabold leading-none">
                {formatINR(tier.totalPrice)}
              </span>
              <span className="text-[11.5px] font-semibold text-emerald-100/75">
                {tier.items.length} picks across {tier.storeCount}{" "}
                {tier.storeCount === 1 ? "store" : "stores"}
              </span>
            </div>
            <p className="mt-1 max-w-lg text-[10.5px] leading-relaxed text-emerald-100/65">
              Links run through DealSense&apos;s tracked affiliate redirects. If you buy, we may earn
              a commission at no extra cost to you. It never changes what we recommend.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={copyLink}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/20 bg-white/[0.07] px-3 text-[11px] font-bold text-white transition-colors hover:bg-white/[0.14]"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Link copied" : "Copy setup link"}
            </button>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(whatsappText)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/20 bg-white/[0.07] px-3 text-[11px] font-bold text-white transition-colors hover:bg-white/[0.14]"
            >
              <MessageCircle className="h-3.5 w-3.5" />
              WhatsApp
            </a>
            <button
              type="button"
              onClick={() => setBundleOpen(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-white px-3.5 text-[11.5px] font-extrabold text-emerald-900 transition-transform hover:-translate-y-0.5"
            >
              <Layers className="h-3.5 w-3.5" />
              Review full bundle
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      <p className="mt-4 text-center text-[9.5px] leading-relaxed text-muted">
        Prices are the latest values DealSense recorded across its tracked stores. They are not live
        checkout quotes. Confirm price, seller and delivery on the store page before paying.
      </p>

      <SetupBundleModal
        open={bundleOpen}
        onClose={() => setBundleOpen(false)}
        tier={tier}
        spaceTitle={setup.title}
        shareUrl={shareUrl}
      />
    </section>
  );
}

function SummaryStat({
  label,
  value,
  tone = "default",
  hint,
}: {
  label: string;
  value: string;
  tone?: "default" | "brand" | "red";
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-hairline-soft bg-subtle px-3 py-2.5">
      <div className="text-[9px] font-extrabold uppercase leading-tight tracking-[0.06em] text-muted">
        {label}
      </div>
      <div
        className={cn(
          "tabular mt-0.5 text-[17px] font-extrabold leading-tight",
          tone === "brand" && "text-[var(--dw-green-mid)]",
          tone === "red" && "text-[var(--verdict-avoid)]",
          tone === "default" && "text-headline",
        )}
      >
        {value}
      </div>
      {hint && <div className="mt-0.5 text-[9px] font-semibold leading-tight text-muted">{hint}</div>}
    </div>
  );
}

function ScoreRing({ score }: { score: number | null }) {
  const r = 21;
  const c = 2 * Math.PI * r;
  const pct = score === null ? 0 : Math.max(0, Math.min(100, score));
  const color = score === null ? "#94a3b8" : pct >= 70 ? "#10b981" : pct >= 50 ? "#0284c7" : "#d97706";

  return (
    <div className="relative grid h-[66px] w-[66px] shrink-0 place-items-center">
      <svg viewBox="0 0 52 52" className="h-full w-full -rotate-90" aria-hidden>
        <circle cx="26" cy="26" r={r} fill="none" stroke="var(--border-card)" strokeWidth="4" />
        <circle
          cx="26"
          cy="26"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct / 100)}
          style={{ transition: "stroke-dashoffset 600ms ease" }}
        />
      </svg>
      <div className="absolute text-center">
        <div className="tabular text-[15px] font-extrabold leading-none text-headline">
          {score === null ? "—" : score}
        </div>
        <div className="text-[7px] font-bold uppercase tracking-wider text-muted">/100</div>
      </div>
    </div>
  );
}

function PhaseHeader({
  phase,
  title,
  subtitle,
  total,
  count,
}: {
  phase: 1 | 2;
  title: string;
  subtitle: string;
  total: number;
  count: number;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-hairline pb-3">
      <div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.1em]",
              phase === 1
                ? "border-[var(--dw-green-border)] bg-[var(--dw-green-surface)] text-[var(--dw-green-mid)]"
                : "border-hairline bg-elevated text-secondary",
            )}
          >
            Phase {phase}
          </span>
          <h3 className="text-[17px] font-extrabold tracking-[-0.02em] text-headline">{title}</h3>
        </div>
        <p className="mt-1 text-[11.5px] text-secondary">{subtitle}</p>
      </div>
      <div className="text-right">
        <div className="tabular text-[14px] font-extrabold text-headline">{formatINR(total)}</div>
        <div className="text-[9.5px] font-semibold text-muted">
          {count} {count === 1 ? "item" : "items"}
        </div>
      </div>
    </div>
  );
}
