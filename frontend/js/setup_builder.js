// ==========================================================================
// DEALSENSE SMART SETUP BUILDER
//
// Composes budget-capped setups from products DealSense actually price-tracks
// on Amazon and Flipkart.
//
// Rendering rules this module obeys, without exception:
//   * A missing number renders as "--". It is never coerced to 0.
//   * A slot with no qualifying product renders as a visible gap with a reason.
//   * Verdicts and provenance come from the API. Nothing is asserted here.
//   * If the API fails, an error is shown. No setup is generated client-side.
// ==========================================================================

import { generateSetup as apiGenerateSetup, fetchSetupTemplates } from "./api.js";
import { escapeHtml, showToast } from "./ui.js";

let templates = null;          // blueprint metadata from the API
let currentSpace = "bedroom";
let currentBudget = 25000;
let currentOwned = [];
let currentStyle = "no_preference";
let currentTiers = [];
let activeTierIdx = 0;
let lastResult = null;
let isGenerating = false;
let generationToken = 0;       // guards against out-of-order async responses

// ─────────────────────────── formatting ───────────────────────────

const INR = (n) =>
  `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

/** Formats a value as currency, or "--" when it genuinely has no value. */
function money(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "--";
  return INR(n);
}

function signedMoney(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "--";
  const v = Number(n);
  return v >= 0 ? INR(v) : `-${INR(Math.abs(v))}`;
}

// Provenance badges. Copy matches the trust vocabulary used across the app.
const PROVENANCE_META = {
  LIVE: { label: "LIVE", cls: "prov-live", tip: "Price checked within the last 15 minutes." },
  VERIFIED: { label: "VERIFIED", cls: "prov-verified", tip: "Recent price with enough history to judge it." },
  OBSERVED: { label: "OBSERVED", cls: "prov-observed", tip: "Price recorded from the merchant, limited history so far." },
  STALE: { label: "STALE", cls: "prov-stale", tip: "Last checked over 24 hours ago. Confirm on the store page." },
  UNVERIFIED: { label: "NO PRICE RECORD", cls: "prov-unverified", tip: "No recorded observation for this listing." },
};

const VERDICT_CLASS = {
  BUY: "verdict-buy",
  WAIT: "verdict-wait",
  SKIP: "verdict-skip",
  "NOT ENOUGH DATA": "verdict-unknown",
};

const UNFILLED_COPY = {
  NO_MATCHING_PRODUCT: "Nothing tracked for this slot yet",
  NO_PRICED_LISTING: "Tracked, but no recorded price yet",
  OUT_OF_BUDGET_RANGE: "Nothing tracked in this price range",
  OWNED: "You already own this",
};

// ─────────────────────────── deep links ───────────────────────────

export function getSetupDeepLink(tierIdx = activeTierIdx) {
  const base = `${window.location.origin}${window.location.pathname}`;
  const params = new URLSearchParams();
  params.set("view", "setup");
  params.set("space", currentSpace);
  params.set("budget", String(currentBudget));
  if (currentOwned.length) params.set("owned", currentOwned.join(","));
  if (currentStyle && currentStyle !== "no_preference") params.set("style", currentStyle);
  params.set("tier", String(tierIdx + 1));
  return `${base}?${params.toString()}`;
}

export function shareOnWhatsApp(tier) {
  const t = tier || currentTiers[activeTierIdx];
  if (!t) return;

  const spaceTitle = lastResult?.title || currentSpace.replace(/_/g, " ");
  const items = t.items || [];
  const lines = items
    .slice(0, 5)
    .map((it) => `• ${it.title} — ${INR(it.price)} (${it.merchant})`)
    .join("\n");

  const scoreLine =
    t.setup_score !== null && t.setup_score !== undefined
      ? `\n📊 Setup Score: ${t.setup_score}/100`
      : "";

  const gapLine =
    t.unfilled && t.unfilled.length
      ? `\n⚠️ ${t.unfilled.length} slot(s) still need products.`
      : "";

  const text =
`🛋️ *${t.label} — ${spaceTitle}* on DealSense
💰 Total: ${INR(t.total_price)} of a ${INR(currentBudget)} budget${scoreLine}${gapLine}

✨ *What's in it:*
${lines}${items.length > 5 ? `\n…and ${items.length - 5} more` : ""}

Every price above comes from a real recorded observation, not an estimate.

🔗 ${getSetupDeepLink()}`;

  window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, "_blank");
}

export async function copySetupLink() {
  const link = getSetupDeepLink();
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(link);
    } else {
      const ta = document.createElement("textarea");
      ta.value = link;
      ta.setAttribute("readonly", "");
      ta.style.position = "absolute";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    showToast("Setup link copied.", "success");
  } catch (err) {
    showToast(`Setup link: ${link}`, "info");
  }
}

// ─────────────────────────── init ───────────────────────────

let initPromise = null;

/**
 * Initialises once and returns the same promise on every later call, so
 * callers can safely await readiness without racing the template fetch.
 */
export function ensureSetupBuilder() {
  if (!initPromise) initPromise = initSetupBuilder();
  return initPromise;
}

/**
 * Switches to a space from outside the module (e.g. a homepage card).
 * Awaits initialisation first, because the space cards are rendered from the
 * API and do not exist synchronously.
 *
 * `budget` is an optional starting budget (homepage cards carry one in
 * data-budget). It is only honoured when it falls inside the blueprint's real
 * range; anything outside is ignored in favour of the blueprint default, so a
 * stale number in a template can never push the engine outside its range.
 */
export async function selectSpace(space, budget = null) {
  await ensureSetupBuilder();
  if (!templates?.templates.some((t) => t.key === space)) return;
  currentSpace = space;
  currentOwned = [];

  const requested = Number(budget);
  if (Number.isFinite(requested) && requested > 0) {
    const bp = templates.templates.find((t) => t.key === space);
    if (bp && requested >= bp.budget_min && requested <= bp.budget_max) {
      currentBudget = requested;
    }
  }

  applyBlueprintBudgetRange();
  renderSpaceCards();
  renderOwnedCheckboxes();
  triggerGenerateSetup();
}

export async function initSetupBuilder() {
  try {
    templates = await fetchSetupTemplates();
  } catch (err) {
    showSetupError(
      "Couldn't load setup templates",
      "The setup engine isn't responding. Make sure the DealSense server is running, then try again."
    );
    return;
  }

  renderSpaceCards();
  renderStylePills();
  applyBlueprintBudgetRange();
  renderOwnedCheckboxes();
  attachSetupEventListeners();

  const hydrated = hydrateSetupFromUrl();
  if (hydrated) {
    renderSpaceCards();
    renderStylePills();
    renderOwnedCheckboxes();
  }
  triggerGenerateSetup();
}

function currentBlueprint() {
  if (!templates) return null;
  return templates.templates.find((t) => t.key === currentSpace) || templates.templates[0];
}

export function hydrateSetupFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const space = params.get("space");
  const budget = params.get("budget");
  const owned = params.get("owned");
  const style = params.get("style");
  const tier = params.get("tier");

  if (!space && !budget && params.get("view") !== "setup") return false;

  if (space && templates?.templates.some((t) => t.key === space)) {
    currentSpace = space;
    applyBlueprintBudgetRange();
  }
  if (budget) {
    const b = Number(budget);
    if (!Number.isNaN(b) && b > 0) setBudget(b);
  }
  if (owned) {
    currentOwned = owned.split(",").map((s) => s.trim()).filter(Boolean);
  }
  if (style && templates?.styles.some((s) => s.key === style)) {
    currentStyle = style;
  }
  if (tier) {
    const t = Number(tier) - 1;
    if (t >= 0 && t <= 2) activeTierIdx = t;
  }
  return true;
}

// ─────────────────────────── configurator ───────────────────────────

const SPACE_ICON_MAP = {
  bed: "🛏️",
  desk: "🖥️",
  sofa: "🛋️",
  gamepad: "🎮",
  book: "📚",
  coffee: "☕",
};

function renderSpaceCards() {
  const group = document.getElementById("spaceSelectGroup");
  if (!group || !templates) return;

  group.innerHTML = templates.templates
    .map(
      (t) => `
      <button type="button"
              class="space-card ${t.key === currentSpace ? "active" : ""}"
              data-space="${escapeHtml(t.key)}"
              aria-pressed="${t.key === currentSpace}">
        <span class="space-icon" aria-hidden="true">${SPACE_ICON_MAP[t.icon] || "🏠"}</span>
        <span class="space-title">${escapeHtml(t.title)}</span>
        <span class="space-sub">${escapeHtml(t.tagline)}</span>
      </button>`
    )
    .join("");

  group.querySelectorAll(".space-card").forEach((card) => {
    card.addEventListener("click", () => {
      currentSpace = card.getAttribute("data-space");
      currentOwned = [];
      applyBlueprintBudgetRange();
      renderSpaceCards();
      renderOwnedCheckboxes();
      triggerGenerateSetup();
    });
  });
}

function renderStylePills() {
  const group = document.getElementById("styleSelectGroup");
  if (!group || !templates) return;

  group.innerHTML = templates.styles
    .map(
      (s) => `
      <button type="button"
              class="style-pill ${s.key === currentStyle ? "active" : ""}"
              data-style="${escapeHtml(s.key)}"
              title="${escapeHtml(s.description || "")}"
              aria-pressed="${s.key === currentStyle}">
        ${escapeHtml(s.label)}
      </button>`
    )
    .join("");

  group.querySelectorAll(".style-pill").forEach((pill) => {
    pill.addEventListener("click", () => {
      currentStyle = pill.getAttribute("data-style");
      renderStylePills();
      triggerGenerateSetup();
    });
  });
}

/** Points the slider at the blueprint's real budget range. */
function applyBlueprintBudgetRange() {
  const bp = currentBlueprint();
  if (!bp) return;

  const slider = document.getElementById("setupBudgetSlider");
  if (slider) {
    slider.min = String(bp.budget_min);
    slider.max = String(bp.budget_max);
    slider.step = "1000";
  }

  if (currentBudget < bp.budget_min || currentBudget > bp.budget_max) {
    setBudget(bp.budget_default);
  } else {
    setBudget(currentBudget);
  }
  renderBudgetPills();
}

function renderBudgetPills() {
  const group = document.getElementById("budgetPillsGroup");
  const bp = currentBlueprint();
  if (!group || !bp) return;

  // Four stops spanning the blueprint's real range.
  const span = bp.budget_max - bp.budget_min;
  const stops = [0, 0.25, 0.55, 1].map((f) =>
    Math.round((bp.budget_min + span * f) / 1000) * 1000
  );

  group.innerHTML = [...new Set(stops)]
    .map(
      (v) => `
      <button type="button" class="budget-pill ${v === currentBudget ? "active" : ""}" data-val="${v}">
        ${INR(v)}
      </button>`
    )
    .join("");

  group.querySelectorAll(".budget-pill").forEach((pill) => {
    pill.addEventListener("click", () => {
      setBudget(Number(pill.getAttribute("data-val")));
      renderBudgetPills();
      triggerGenerateSetup();
    });
  });
}

function setBudget(value) {
  currentBudget = value;
  const slider = document.getElementById("setupBudgetSlider");
  const display = document.getElementById("budgetDisplayVal");
  if (slider) slider.value = String(value);
  if (display) display.textContent = INR(value);
}

/** Owned options come from the blueprint's real slots, so they always match. */
function renderOwnedCheckboxes() {
  const group = document.getElementById("ownedItemsGroup");
  const bp = currentBlueprint();
  if (!group || !bp) return;

  group.innerHTML = bp.slots
    .map((slot) => {
      const checked = currentOwned.includes(slot.owned_key);
      return `
        <label class="owned-pill ${checked ? "active" : ""}">
          <input type="checkbox" value="${escapeHtml(slot.owned_key)}" ${checked ? "checked" : ""}>
          <span>${escapeHtml(slot.label)}</span>
        </label>`;
    })
    .join("");

  group.querySelectorAll("input[type='checkbox']").forEach((cb) => {
    cb.addEventListener("change", () => {
      const val = cb.value;
      if (cb.checked) {
        if (!currentOwned.includes(val)) currentOwned.push(val);
      } else {
        currentOwned = currentOwned.filter((x) => x !== val);
      }
      cb.parentElement.classList.toggle("active", cb.checked);
      triggerGenerateSetup();
    });
  });
}

function attachSetupEventListeners() {
  const slider = document.getElementById("setupBudgetSlider");
  if (slider) {
    slider.addEventListener("input", () => {
      setBudget(Number(slider.value));
      renderBudgetPills();
    });
    slider.addEventListener("change", () => triggerGenerateSetup());
  }

  document.getElementById("generateSetupBtn")?.addEventListener("click", () => triggerGenerateSetup());
  document.getElementById("setupRetryBtn")?.addEventListener("click", () => triggerGenerateSetup());
  document.getElementById("copySetupLinkBtn")?.addEventListener("click", () => copySetupLink());
  document.getElementById("shareSetupBtn")?.addEventListener("click", () => shareOnWhatsApp());

  document.getElementById("buyAllSetupBtn")?.addEventListener("click", () => {
    const tier = currentTiers[activeTierIdx];
    if (tier) openBundleModal(tier);
  });

  const backdrop = document.getElementById("bundleModalBackdrop");
  const closeBtn = document.getElementById("closeBundleModalBtn");
  closeBtn?.addEventListener("click", () => closeBundleModal());
  backdrop?.addEventListener("click", (e) => {
    if (e.target === backdrop) closeBundleModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeBundleModal();
  });
}

function closeBundleModal() {
  const backdrop = document.getElementById("bundleModalBackdrop");
  if (backdrop) backdrop.style.display = "none";
}

// ─────────────────────────── generation ───────────────────────────

function setPanelVisibility({ results, error, empty }) {
  const map = {
    setupResultsContainer: results,
    setupErrorState: error,
    setupEmptyState: empty,
  };
  Object.entries(map).forEach(([id, visible]) => {
    const el = document.getElementById(id);
    if (el) el.style.display = visible ? "block" : "none";
  });
}

function showSetupError(title, body) {
  setPanelVisibility({ results: false, error: true, empty: false });
  const t = document.getElementById("setupErrorTitle");
  const b = document.getElementById("setupErrorBody");
  if (t) t.textContent = title;
  if (b) b.textContent = body;
}

async function triggerGenerateSetup() {
  const btn = document.getElementById("generateSetupBtn");
  if (isGenerating) return;

  const token = ++generationToken;
  isGenerating = true;

  if (btn) {
    btn.disabled = true;
    btn.setAttribute("aria-busy", "true");
    btn.innerHTML = `
      <svg class="btn-spinner-ring" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke-width="3" aria-hidden="true" style="display:inline-block;vertical-align:middle;margin-right:6px;">
        <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.25)"></circle>
        <path d="M12 2a10 10 0 0 1 10 10" stroke="#FFFFFF" stroke-linecap="round"></path>
      </svg>
      <span>Composing setup…</span>`;
  }

  try {
    const data = await apiGenerateSetup({
      space: currentSpace,
      budget: currentBudget,
      owned: currentOwned,
      style: currentStyle,
    });

    // A newer request superseded this one; drop the stale response.
    if (token !== generationToken) return;

    lastResult = data;
    currentTiers = data.tiers || [];

    const anyItems = currentTiers.some((t) => (t.items || []).length > 0);
    if (!anyItems) {
      setPanelVisibility({ results: false, error: false, empty: true });
      const body = document.getElementById("setupEmptyBody");
      if (body) {
        body.textContent =
          data.catalog_size === 0
            ? "DealSense isn't tracking any products yet. Run: python -m scripts.tracker --seed-setups"
            : `DealSense is tracking ${data.catalog_size} product(s), but none match this space at ${INR(currentBudget)}. Try a higher budget, or add products for this space to data/setup_seeds.json.`;
      }
      return;
    }

    setPanelVisibility({ results: true, error: false, empty: false });
    renderTrustGuard(data.owned);
    if (activeTierIdx >= currentTiers.length) activeTierIdx = 0;
    renderSetupTiers(activeTierIdx);
  } catch (err) {
    if (token !== generationToken) return;
    showSetupError("Couldn't build your setup", err.message || "The setup engine didn't respond.");
  } finally {
    if (token === generationToken) isGenerating = false;
    if (btn) {
      btn.disabled = false;
      btn.removeAttribute("aria-busy");
      btn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 2L13.8 7.5a2 2 0 0 0 1.3 1.3L21 11l-5.9 2.2a2 2 0 0 0-1.3 1.3L12 20l-1.8-5.5a2 2 0 0 0-1.3-1.3L3 11l5.9-2.2a2 2 0 0 0 1.3-1.3L12 2Z"/>
        </svg>
        <span>Build my setup</span>`;
    }
  }
}

function renderTrustGuard(owned) {
  const banner = document.getElementById("trustGuardBanner");
  const pill = document.getElementById("trustGuardSavedPill");
  const desc = document.getElementById("trustGuardDesc");
  if (!banner) return;

  if (!owned || !owned.count) {
    banner.style.display = "none";
    return;
  }

  banner.style.display = "flex";
  if (pill) pill.textContent = `${owned.count} item${owned.count === 1 ? "" : "s"} skipped`;
  if (desc) {
    const names = (owned.slots || []).map((s) => s.label).join(", ");
    desc.innerHTML =
      `You already own <strong>${escapeHtml(names)}</strong>, so DealSense left ` +
      `${owned.count === 1 ? "it" : "them"} out and spread that share of your budget ` +
      `across the remaining slots. No duplicate recommendations, no padded total.`;
  }
}

// ─────────────────────────── tier rendering ───────────────────────────

function renderSetupTiers(tierIndex) {
  if (!currentTiers.length) return;
  activeTierIdx = tierIndex;
  const tier = currentTiers[tierIndex];

  const tabsBar = document.getElementById("tierTabsBar");
  if (tabsBar) {
    tabsBar.setAttribute("role", "tablist");
    tabsBar.innerHTML = currentTiers
      .map(
        (t, idx) => `
        <button type="button"
                role="tab"
                aria-selected="${idx === tierIndex}"
                class="tier-tab-btn ${idx === tierIndex ? "active" : ""}"
                style="--tier-accent: ${escapeHtml(t.accent)};"
                data-idx="${idx}">
          <div class="tier-tab-header">
            <span class="tier-tab-title">${escapeHtml(t.label)}</span>
            <span class="tier-tab-badge">${t.item_count} item${t.item_count === 1 ? "" : "s"}</span>
          </div>
          <div class="tier-tab-price">${money(t.total_price)}</div>
        </button>`
      )
      .join("");

    tabsBar.querySelectorAll(".tier-tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => renderSetupTiers(Number(btn.getAttribute("data-idx"))));
    });
  }

  setText("tierTotalCost", money(tier.total_price));
  setText("tierTotalSavings", tier.total_savings_vs_mrp ? money(tier.total_savings_vs_mrp) : "--");

  const remaining = document.getElementById("tierBudgetRemaining");
  if (remaining) {
    remaining.textContent = signedMoney(tier.budget_remaining);
    remaining.style.color = tier.budget_remaining >= 0 ? "#60A5FA" : "#F87171";
  }

  const scoreEl = document.getElementById("tierSetupScore");
  if (scoreEl) {
    scoreEl.textContent =
      tier.setup_score === null || tier.setup_score === undefined
        ? "--"
        : `${tier.setup_score}/100`;
  }

  setText("tierAllocationAdvice", buildAdviceText(tier));
  renderScoreBreakdown(tier);
  renderDataNotice(tier);

  const p1 = (tier.items || []).filter((i) => i.phase === 1);
  const p2 = (tier.items || []).filter((i) => i.phase === 2);

  setText("phase1Subtotal", `Subtotal: ${money(tier.phase1_total)}`);
  setText("phase2Subtotal", `Subtotal: ${money(tier.phase2_total)}`);

  renderGrid("phase1Grid", p1, (tier.unfilled || []).filter((u) => u.phase === 1));
  renderGrid("phase2Grid", p2, (tier.unfilled || []).filter((u) => u.phase === 2));

  setText("bottomBarTierTitle", tier.label);
  const stores = tier.store_count === 1 ? "1 store" : `${tier.store_count} stores`;
  setText(
    "bottomBarItemCount",
    `${tier.item_count} item${tier.item_count === 1 ? "" : "s"} across ${stores}`
  );
  setText("buyAllCost", Number(tier.total_price).toLocaleString("en-IN", { maximumFractionDigits: 0 }));
}

function buildAdviceText(tier) {
  const parts = [];
  if (tier.budget_remaining >= 0) {
    parts.push(`${money(tier.budget_remaining)} left of your ${INR(currentBudget)} budget.`);
  } else {
    parts.push(`${money(Math.abs(tier.budget_remaining))} over your ${INR(currentBudget)} budget at this tier.`);
  }

  const dc = tier.data_completeness || {};
  if (dc.items_awaiting_history) {
    parts.push(
      `${dc.items_awaiting_history} item${dc.items_awaiting_history === 1 ? "" : "s"} ` +
      `need${dc.items_awaiting_history === 1 ? "s" : ""} more price history before DealSense will call it a good deal.`
    );
  }
  return parts.join(" ");
}

function renderScoreBreakdown(tier) {
  const wrap = document.getElementById("setupScoreDetails");
  const body = document.getElementById("setupScoreBreakdown");
  if (!wrap || !body) return;

  const bd = tier.score_breakdown || {};
  const keys = Object.keys(bd).filter((k) => bd[k] && typeof bd[k] === "object" && "weight" in bd[k]);

  if (!keys.length) {
    wrap.style.display = "none";
    return;
  }

  wrap.style.display = "block";
  body.innerHTML = keys
    .map((k) => {
      const c = bd[k];
      const earned = (c.value * c.weight).toFixed(1);
      const pct = Math.round(c.value * 100);
      const label = k.replace(/_/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase());
      return `
        <div class="score-component">
          <div class="score-component-head">
            <span class="score-component-name">${escapeHtml(label)}</span>
            <span class="score-component-val">${earned} / ${c.weight}</span>
          </div>
          <div class="score-bar" role="img" aria-label="${pct} percent">
            <div class="score-bar-fill" style="width:${pct}%"></div>
          </div>
          <p class="score-component-detail">${escapeHtml(c.detail || "")}</p>
        </div>`;
    })
    .join("");
}

function renderDataNotice(tier) {
  const panel = document.getElementById("setupDataNotice");
  const title = document.getElementById("setupDataNoticeTitle");
  const body = document.getElementById("setupDataNoticeBody");
  const list = document.getElementById("setupUnfilledList");
  if (!panel) return;

  const unfilled = tier.unfilled || [];
  if (!unfilled.length) {
    panel.style.display = "none";
    return;
  }

  panel.style.display = "block";
  if (title) {
    title.textContent = `${unfilled.length} slot${unfilled.length === 1 ? "" : "s"} couldn't be filled`;
  }
  if (body) {
    body.textContent =
      "DealSense only recommends products it actively price-tracks. Rather than filling these with a guess, it's showing you exactly what's missing.";
  }
  if (list) {
    list.innerHTML = unfilled
      .map(
        (u) => `
        <li class="unfilled-row">
          <span class="unfilled-label">${escapeHtml(u.slot_label)}</span>
          <span class="unfilled-reason">${escapeHtml(UNFILLED_COPY[u.reason] || u.reason)}</span>
          <span class="unfilled-detail">${escapeHtml(u.detail)}</span>
        </li>`
      )
      .join("");
  }
}

function renderGrid(gridId, items, unfilled) {
  const grid = document.getElementById(gridId);
  if (!grid) return;

  const cards = items.map(renderSetupItemCard).join("");
  const gaps = (unfilled || []).map(renderUnfilledCard).join("");

  grid.innerHTML =
    cards + gaps ||
    `<p class="setup-grid-empty">Nothing tracked for this phase yet.</p>`;
}

function renderSetupItemCard(item) {
  const prov = PROVENANCE_META[item.provenance] || PROVENANCE_META.OBSERVED;
  const verdictCls = VERDICT_CLASS[item.verdict] || "verdict-unknown";

  // MRP and discount render only when the merchant actually published an MRP.
  const mrpBlock =
    item.mrp && item.mrp > item.price
      ? `<span class="setup-card-mrp">${INR(item.mrp)}</span>
         <span class="setup-card-off">${item.discount_pct}% off</span>`
      : "";

  const historyNote = item.has_sufficient_history
    ? `<span class="setup-card-history">${item.observation_count} price checks recorded</span>`
    : `<span class="setup-card-history muted">Not enough history yet — verdict is provisional</span>`;

  const lowNote =
    item.historical_low && item.historical_low < item.price
      ? `<span class="setup-card-low">Lowest seen: ${INR(item.historical_low)}</span>`
      : "";

  const img = item.image_url
    ? `<img src="${escapeHtml(item.image_url)}" alt="" class="setup-card-thumb" loading="lazy" decoding="async">`
    : `<div class="setup-card-thumb setup-card-thumb-empty" aria-hidden="true">📦</div>`;

  return `
    <article class="setup-item-card">
      <div class="setup-card-top">
        <span class="setup-cat-tag">${escapeHtml(item.slot_label)}</span>
        <span class="prov-badge ${prov.cls}" title="${escapeHtml(prov.tip)}">${prov.label}</span>
      </div>

      ${img}

      <h4 class="setup-item-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</h4>
      <p class="setup-item-reason">${escapeHtml(item.rationale)}</p>

      <div class="setup-card-verdict-row">
        <span class="verdict-chip ${verdictCls}">${escapeHtml(item.verdict)}</span>
        <span class="setup-card-store">${escapeHtml(item.merchant)}</span>
      </div>
      <p class="setup-card-verdict-why">${escapeHtml(item.verdict_summary)}</p>

      <div class="setup-card-evidence">
        ${historyNote}
        ${lowNote}
      </div>

      <div class="setup-card-price-row">
        <div class="setup-card-prices">
          <span class="setup-card-price">${INR(item.price)}</span>
          ${mrpBlock}
        </div>
        <a href="${escapeHtml(item.affiliate_url)}"
           target="_blank"
           rel="noopener sponsored"
           class="btn-buy-item">Buy on ${escapeHtml(item.merchant)} ↗</a>
      </div>
    </article>`;
}

function renderUnfilledCard(slot) {
  return `
    <article class="setup-item-card setup-item-card-empty">
      <div class="setup-card-top">
        <span class="setup-cat-tag">${escapeHtml(slot.slot_label)}</span>
        <span class="prov-badge prov-unverified">NOT FILLED</span>
      </div>
      <div class="setup-card-thumb setup-card-thumb-empty" aria-hidden="true">➕</div>
      <h4 class="setup-item-title">${escapeHtml(UNFILLED_COPY[slot.reason] || slot.reason)}</h4>
      <p class="setup-item-reason">${escapeHtml(slot.detail)}</p>
      <div class="setup-card-price-row">
        <div class="setup-card-prices">
          <span class="setup-card-price muted">--</span>
        </div>
        <span class="setup-budget-hint">Budgeted ${money(slot.target_spend)}</span>
      </div>
    </article>`;
}

// ─────────────────────────── bundle modal ───────────────────────────

function openBundleModal(tier) {
  const backdrop = document.getElementById("bundleModalBackdrop");
  if (!backdrop || !tier) return;

  const items = tier.items || [];
  setText("bundleModalTitle", `${tier.label} (${items.length} item${items.length === 1 ? "" : "s"})`);
  setText("bundleModalTotal", money(tier.total_price));
  setText("bundleModalMrp", tier.total_mrp ? money(tier.total_mrp) : "--");

  const savingsEl = document.getElementById("bundleModalSavings");
  if (savingsEl) {
    if (tier.total_savings_vs_mrp && tier.total_mrp) {
      const pct = Math.round((tier.total_savings_vs_mrp / tier.total_mrp) * 100);
      savingsEl.textContent = `${money(tier.total_savings_vs_mrp)} (${pct}%)`;
    } else {
      savingsEl.textContent = "No MRP published";
    }
  }

  // Group by merchant so the user checks out store by store.
  const byStore = {};
  items.forEach((it) => {
    (byStore[it.merchant] ||= []).push(it);
  });

  const body = document.getElementById("bundleModalBody");
  if (body) {
    body.innerHTML = Object.entries(byStore)
      .map(([store, storeItems]) => {
        const subtotal = storeItems.reduce((a, x) => a + x.price, 0);
        return `
          <div class="bundle-store-group">
            <div class="bundle-store-header">
              <div class="bundle-store-brand">
                <span class="bundle-store-name">${escapeHtml(store)}</span>
                <span class="bundle-store-badge">${storeItems.length} item${storeItems.length === 1 ? "" : "s"}</span>
              </div>
              <div class="bundle-store-actions">
                <span class="bundle-store-total">${INR(subtotal)}</span>
                <button type="button" class="btn-store-batch-open" data-store="${escapeHtml(store)}">
                  Open ${escapeHtml(store)} items ↗
                </button>
              </div>
            </div>
            <div class="bundle-items-list">
              ${storeItems
                .map(
                  (item) => `
                <div class="bundle-item-row">
                  ${
                    item.image_url
                      ? `<img src="${escapeHtml(item.image_url)}" alt="" class="bundle-item-img" loading="lazy">`
                      : `<div class="bundle-item-img bundle-item-img-empty" aria-hidden="true">📦</div>`
                  }
                  <div class="bundle-item-info">
                    <span class="bundle-item-cat">${escapeHtml(item.slot_label)}</span>
                    <h4 class="bundle-item-title">${escapeHtml(item.title)}</h4>
                    <div class="bundle-item-verdict">
                      <span class="verdict-tag ${VERDICT_CLASS[item.verdict] || "verdict-unknown"}">${escapeHtml(item.verdict)}</span>
                      <span class="bundle-item-phase">Phase ${item.phase}</span>
                    </div>
                  </div>
                  <div class="bundle-item-pricing">
                    <strong class="bundle-item-price">${INR(item.price)}</strong>
                    ${item.mrp && item.mrp > item.price ? `<span class="bundle-item-mrp">${INR(item.mrp)}</span>` : ""}
                    <a href="${escapeHtml(item.affiliate_url)}" target="_blank" rel="noopener sponsored" class="btn-buy-single-item">
                      Buy ↗
                    </a>
                  </div>
                </div>`
                )
                .join("")}
            </div>
          </div>`;
      })
      .join("");

    body.querySelectorAll(".btn-store-batch-open").forEach((btn) => {
      btn.addEventListener("click", () => {
        const store = btn.getAttribute("data-store");
        openLinks((byStore[store] || []).map((i) => i.affiliate_url));
      });
    });
  }

  const openAll = document.getElementById("openAllStoresBtn");
  if (openAll) openAll.onclick = () => openLinks(items.map((i) => i.affiliate_url));

  const wa = document.getElementById("modalShareWhatsappBtn");
  if (wa) wa.onclick = () => shareOnWhatsApp(tier);

  const copy = document.getElementById("modalCopyLinkBtn");
  if (copy) copy.onclick = () => copySetupLink();

  backdrop.style.display = "flex";
}

/**
 * Opens store links, staggered slightly so popup blockers are less likely to
 * swallow the batch, and warns if the browser blocked them anyway.
 */
function openLinks(urls) {
  const valid = urls.filter(Boolean);
  if (!valid.length) return;

  let blocked = 0;
  valid.forEach((url, i) => {
    setTimeout(() => {
      const w = window.open(url, "_blank", "noopener");
      if (!w) blocked += 1;
      if (i === valid.length - 1 && blocked > 0) {
        showToast("Your browser blocked some tabs. Allow popups for this site to open them all.", "info");
      }
    }, i * 120);
  });
}

// ─────────────────────────── util ───────────────────────────

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}
