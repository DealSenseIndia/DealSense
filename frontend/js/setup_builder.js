// ==========================================================================
// DEALWISE SMART SETUP BUILDER MODULE (The Strategic Weapon)
// Composes budget-capped, aesthetic room setups across Amazon, Flipkart & IKEA.
// ==========================================================================

import { generateSetup as apiGenerateSetup } from "./api.js";
import { escapeHtml, showToast } from "./ui.js";

let currentSpace = "bedroom";
let currentBudget = 25000;
let currentOwnedItems = ["bed"];
let currentStyle = "modern_minimal";
let currentSetupTiers = [];
let activeTierIdx = 0;

const SPACE_OWNED_OPTIONS = {
  bedroom: [
    { id: "bed", label: "Bed Frame" },
    { id: "mattress", label: "Mattress" },
    { id: "curtains", label: "Curtains" },
    { id: "lighting", label: "Floor Lamp" },
    { id: "rug", label: "Floor Rug" },
    { id: "bedside_table", label: "Nightstand" },
    { id: "decor_plants", label: "Planters" },
  ],
  wfh_desk: [
    { id: "desk", label: "Computer Desk" },
    { id: "chair", label: "Ergonomic Chair" },
    { id: "lighting", label: "Monitor Light Bar" },
    { id: "desk_accessories", label: "Desk Mat / Riser" },
  ],
  living_room: [
    { id: "sofa", label: "Sofa / Couch" },
    { id: "coffee_table", label: "Coffee Table" },
    { id: "tv_unit", label: "TV Console" },
    { id: "rug", label: "Floor Rug" },
    { id: "lighting", label: "Floor Lamp" },
    { id: "wall_art", label: "Wall Art / Prints" },
  ],
  kitchen_bar: [
    { id: "coffee_machine", label: "Coffee Maker" },
    { id: "air_fryer", label: "Air Fryer" },
    { id: "bakers_rack", label: "Counter Rack" },
    { id: "storage_canisters", label: "Storage Jars" },
    { id: "under_cabinet_lighting", label: "Under-Cabinet Lights" },
  ],
};

// ==========================================================================
// DEEP LINKING & SHARE HELPERS
// ==========================================================================

export function getSetupDeepLink(tierIdx = activeTierIdx) {
  const base = `${window.location.origin}${window.location.pathname}`;
  const params = new URLSearchParams();
  params.set("view", "setup");
  params.set("space", currentSpace);
  params.set("budget", currentBudget.toString());
  if (currentOwnedItems && currentOwnedItems.length > 0) {
    params.set("owned", currentOwnedItems.join(","));
  }
  if (currentStyle && currentStyle !== "modern_minimal") {
    params.set("style", currentStyle);
  }
  params.set("tier", (tierIdx + 1).toString());
  return `${base}?${params.toString()}`;
}

export function shareOnWhatsApp(tier) {
  const targetTier = tier || (currentSetupTiers && currentSetupTiers[activeTierIdx]);
  if (!targetTier) return;

  const link = getSetupDeepLink();
  const roomName = currentSpace.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
  
  const topItems = (targetTier.all_items || []).slice(0, 4)
    .map((it) => `• ${it.name} (₹${it.price.toLocaleString("en-IN")})`)
    .join("\n");

  const text = 
`🛋️ *${targetTier.title} (${roomName} Setup)* curated on DealSense!
💰 Total Cost: ₹${targetTier.total_price.toLocaleString("en-IN")}
🎉 Verified Savings: ₹${targetTier.savings.toLocaleString("en-IN")} vs retail

✨ *Key Curated Deals:*
${topItems}

🛡️ *DealSense Trust Guard:* Kept existing items to eliminate duplicate retail spend.

🔗 *View full setup & multi-store deals here:*
${link}`;

  const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
  window.open(waUrl, "_blank");
}

export async function copySetupLink(tier) {
  const link = getSetupDeepLink();
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(link);
    } else {
      const ta = document.createElement("textarea");
      ta.value = link;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    showToast("Setup link copied to clipboard! Share it with your roommate or spouse.", "success");
  } catch (err) {
    showToast(`Setup Link: ${link}`, "info");
  }
}

export function hydrateSetupFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const requestedSpace = params.get("space");
  const requestedBudget = params.get("budget");
  const requestedOwned = params.get("owned");
  const requestedStyle = params.get("style");
  const requestedTier = params.get("tier");
  const requestedView = params.get("view");

  if (!requestedSpace && !requestedBudget && requestedView !== "setup") {
    return false;
  }

  if (requestedSpace && SPACE_OWNED_OPTIONS[requestedSpace]) {
    currentSpace = requestedSpace;
    const spaceSelectGroup = document.getElementById("spaceSelectGroup");
    if (spaceSelectGroup) {
      spaceSelectGroup.querySelectorAll(".space-card").forEach((card) => {
        card.classList.toggle("active", card.getAttribute("data-space") === currentSpace);
      });
    }
  }

  if (requestedBudget) {
    const b = Number(requestedBudget);
    if (!isNaN(b) && b > 0) {
      currentBudget = b;
      const setupBudgetSlider = document.getElementById("setupBudgetSlider");
      const budgetDisplayVal = document.getElementById("budgetDisplayVal");
      const budgetPillsGroup = document.getElementById("budgetPillsGroup");
      if (setupBudgetSlider) setupBudgetSlider.value = b;
      if (budgetDisplayVal) budgetDisplayVal.textContent = `₹${b.toLocaleString("en-IN")}`;
      if (budgetPillsGroup) {
        budgetPillsGroup.querySelectorAll(".budget-pill").forEach((p) => {
          p.classList.toggle("active", Number(p.getAttribute("data-val")) === b);
        });
      }
    }
  }

  if (requestedOwned) {
    currentOwnedItems = requestedOwned.split(",").map((s) => s.trim()).filter(Boolean);
  }

  if (requestedStyle) {
    currentStyle = requestedStyle;
  }

  if (requestedTier) {
    const t = Number(requestedTier) - 1;
    if (t >= 0 && t <= 2) {
      activeTierIdx = t;
    }
  }

  renderOwnedCheckboxes();
  attachSetupEventListeners();
  triggerGenerateSetup();
  return true;
}

export function initSetupBuilder() {
  const hydrated = hydrateSetupFromUrl();
  if (!hydrated) {
    renderOwnedCheckboxes();
    attachSetupEventListeners();
    triggerGenerateSetup();
  }
}

function renderOwnedCheckboxes() {
  const ownedItemsGroup = document.getElementById("ownedItemsGroup");
  if (!ownedItemsGroup) return;
  const options = SPACE_OWNED_OPTIONS[currentSpace] || SPACE_OWNED_OPTIONS.bedroom;
  ownedItemsGroup.innerHTML = options.map((opt) => {
    const isChecked = currentOwnedItems.includes(opt.id);
    return `
      <label class="owned-pill ${isChecked ? 'active' : ''}">
        <input type="checkbox" value="${opt.id}" ${isChecked ? 'checked' : ''}>
        <span>${opt.label}</span>
      </label>
    `;
  }).join("");

  ownedItemsGroup.querySelectorAll("input[type='checkbox']").forEach((cb) => {
    cb.addEventListener("change", () => {
      const val = cb.value;
      if (cb.checked) {
        if (!currentOwnedItems.includes(val)) currentOwnedItems.push(val);
      } else {
        currentOwnedItems = currentOwnedItems.filter((x) => x !== val);
      }
      cb.parentElement.classList.toggle("active", cb.checked);
      triggerGenerateSetup();
    });
  });
}

function attachSetupEventListeners() {
  const spaceSelectGroup = document.getElementById("spaceSelectGroup");
  const setupBudgetSlider = document.getElementById("setupBudgetSlider");
  const budgetDisplayVal = document.getElementById("budgetDisplayVal");
  const budgetPillsGroup = document.getElementById("budgetPillsGroup");
  const styleSelectGroup = document.getElementById("styleSelectGroup");
  const generateSetupBtn = document.getElementById("generateSetupBtn");
  const shareSetupBtn = document.getElementById("shareSetupBtn");
  const buyAllSetupBtn = document.getElementById("buyAllSetupBtn");
  const closeBundleModalBtn = document.getElementById("closeBundleModalBtn");
  const bundleModalBackdrop = document.getElementById("bundleModalBackdrop");

  // Space selection
  if (spaceSelectGroup) {
    spaceSelectGroup.querySelectorAll(".space-card").forEach((card) => {
      card.addEventListener("click", () => {
        spaceSelectGroup.querySelectorAll(".space-card").forEach((c) => c.classList.remove("active"));
        card.classList.add("active");
        currentSpace = card.getAttribute("data-space");
        currentOwnedItems = currentSpace === "bedroom" ? ["bed"] : currentSpace === "living_room" ? ["sofa"] : [];
        renderOwnedCheckboxes();
        triggerGenerateSetup();
      });
    });
  }

  // Budget slider
  if (setupBudgetSlider) {
    setupBudgetSlider.addEventListener("input", () => {
      currentBudget = Number(setupBudgetSlider.value);
      if (budgetDisplayVal) budgetDisplayVal.textContent = `₹${currentBudget.toLocaleString("en-IN")}`;
      if (budgetPillsGroup) {
        budgetPillsGroup.querySelectorAll(".budget-pill").forEach((pill) => {
          pill.classList.toggle("active", Number(pill.getAttribute("data-val")) === currentBudget);
        });
      }
    });

    setupBudgetSlider.addEventListener("change", () => {
      triggerGenerateSetup();
    });
  }

  // Budget quick pills
  if (budgetPillsGroup) {
    budgetPillsGroup.querySelectorAll(".budget-pill").forEach((pill) => {
      pill.addEventListener("click", () => {
        budgetPillsGroup.querySelectorAll(".budget-pill").forEach((p) => p.classList.remove("active"));
        pill.classList.add("active");
        currentBudget = Number(pill.getAttribute("data-val"));
        if (setupBudgetSlider) setupBudgetSlider.value = currentBudget;
        if (budgetDisplayVal) budgetDisplayVal.textContent = `₹${currentBudget.toLocaleString("en-IN")}`;
        triggerGenerateSetup();
      });
    });
  }

  // Style pills
  if (styleSelectGroup) {
    styleSelectGroup.querySelectorAll(".style-pill").forEach((pill) => {
      pill.addEventListener("click", () => {
        styleSelectGroup.querySelectorAll(".style-pill").forEach((p) => p.classList.remove("active"));
        pill.classList.add("active");
        currentStyle = pill.getAttribute("data-style");
        triggerGenerateSetup();
      });
    });
  }

  // Generate button
  if (generateSetupBtn) {
    generateSetupBtn.addEventListener("click", () => {
      triggerGenerateSetup();
    });
  }

  // Copy setup deep link
  const copySetupLinkBtn = document.getElementById("copySetupLinkBtn");
  if (copySetupLinkBtn) {
    copySetupLinkBtn.addEventListener("click", () => {
      copySetupLink();
    });
  }

  // Share Setup on WhatsApp
  if (shareSetupBtn) {
    shareSetupBtn.addEventListener("click", () => {
      shareOnWhatsApp();
    });
  }

  // Buy All Setup Button -> Opens Interactive Bundle Modal
  if (buyAllSetupBtn) {
    buyAllSetupBtn.addEventListener("click", () => {
      if (!currentSetupTiers || currentSetupTiers.length === 0) return;
      const tier = currentSetupTiers[activeTierIdx];
      openBundleModal(tier);
    });
  }

  // Modal Close Handlers
  if (closeBundleModalBtn && bundleModalBackdrop) {
    closeBundleModalBtn.addEventListener("click", () => {
      bundleModalBackdrop.style.display = "none";
    });

    bundleModalBackdrop.addEventListener("click", (e) => {
      if (e.target === bundleModalBackdrop) {
        bundleModalBackdrop.style.display = "none";
      }
    });
  }
}

function openBundleModal(tier) {
  const backdrop = document.getElementById("bundleModalBackdrop");
  const title = document.getElementById("bundleModalTitle");
  const total = document.getElementById("bundleModalTotal");
  const mrp = document.getElementById("bundleModalMrp");
  const savings = document.getElementById("bundleModalSavings");
  const body = document.getElementById("bundleModalBody");
  const openAllBtn = document.getElementById("openAllStoresBtn");
  const whatsappBtn = document.getElementById("modalShareWhatsappBtn");

  if (!backdrop || !tier) return;

  title.textContent = `${tier.title} (${tier.all_items.length} Items)`;
  total.textContent = `₹${tier.total_price.toLocaleString("en-IN")}`;
  mrp.textContent = `₹${tier.total_mrp.toLocaleString("en-IN")}`;
  const savePct = Math.round((tier.savings / tier.total_mrp) * 100) || 0;
  savings.textContent = `Save ₹${tier.savings.toLocaleString("en-IN")} (${savePct}% OFF)`;

  // Group items by merchant
  const storesMap = {};
  tier.all_items.forEach((item) => {
    const s = item.store || "Amazon";
    if (!storesMap[s]) storesMap[s] = [];
    storesMap[s].push(item);
  });

  body.innerHTML = Object.entries(storesMap).map(([storeName, items]) => {
    const storeSubtotal = items.reduce((acc, x) => acc + x.price, 0);
    const storeLogo = items[0].logo || "/assets/dealsense-icon.png";

    return `
      <div class="bundle-store-group">
        <div class="bundle-store-header">
          <div class="bundle-store-brand">
            <img src="${storeLogo}" alt="${escapeHtml(storeName)}" class="bundle-store-logo">
            <span class="bundle-store-name">${escapeHtml(storeName)}</span>
            <span class="bundle-store-badge">${items.length} ${items.length === 1 ? 'item' : 'items'}</span>
          </div>
          <div class="bundle-store-actions">
            <span class="bundle-store-total">₹${storeSubtotal.toLocaleString("en-IN")}</span>
            <button type="button" class="btn-store-batch-open" data-store="${escapeHtml(storeName)}">
              Open ${escapeHtml(storeName)} Items ↗
            </button>
          </div>
        </div>

        <div class="bundle-items-list">
          ${items.map((item) => `
            <div class="bundle-item-row">
              <img src="${item.image}" alt="${escapeHtml(item.name)}" class="bundle-item-img" loading="lazy">
              <div class="bundle-item-info">
                <span class="bundle-item-cat">${escapeHtml(item.category)}</span>
                <h4 class="bundle-item-title">${escapeHtml(item.name)}</h4>
                <div class="bundle-item-verdict">
                  <span class="verdict-tag">${escapeHtml(item.deal_verdict || 'Verified Deal')}</span>
                  <span class="bundle-item-phase">Phase ${item.phase}</span>
                </div>
              </div>
              <div class="bundle-item-pricing">
                <strong class="bundle-item-price">₹${item.price.toLocaleString("en-IN")}</strong>
                ${item.mrp ? `<span class="bundle-item-mrp">₹${item.mrp.toLocaleString("en-IN")}</span>` : ''}
                <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener sponsored" class="btn-buy-single-item">
                  Buy on ${escapeHtml(storeName)} ↗
                </a>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }).join('');

  // Batch store click handlers
  body.querySelectorAll(".btn-store-batch-open").forEach((btn) => {
    btn.addEventListener("click", () => {
      const sName = btn.getAttribute("data-store");
      const storeItems = storesMap[sName] || [];
      storeItems.forEach((it) => {
        if (it.url) window.open(it.url, "_blank");
      });
    });
  });

  // Open all stores button
  if (openAllBtn) {
    openAllBtn.onclick = () => {
      tier.all_items.forEach((it) => {
        if (it.url) window.open(it.url, "_blank");
      });
    };
  }

  // Share on WhatsApp
  if (whatsappBtn) {
    whatsappBtn.onclick = () => {
      shareOnWhatsApp(tier);
    };
  }

  // Copy Setup Link
  const modalCopyLinkBtn = document.getElementById("modalCopyLinkBtn");
  if (modalCopyLinkBtn) {
    modalCopyLinkBtn.onclick = () => {
      copySetupLink(tier);
    };
  }

  backdrop.style.display = "flex";
}

async function triggerGenerateSetup() {
  const setupResultsContainer = document.getElementById("setupResultsContainer");
  const generateSetupBtn = document.getElementById("generateSetupBtn");
  if (!setupResultsContainer) return;

  try {
    if (generateSetupBtn) {
      generateSetupBtn.disabled = true;
      generateSetupBtn.innerHTML = `
        <svg class="btn-spinner-ring" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="3" style="display:inline-block; vertical-align:middle; margin-right:6px;">
          <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.25)"></circle>
          <path d="M12 2a10 10 0 0 1 10 10" stroke="#FFFFFF" stroke-linecap="round"></path>
        </svg>
        <span>Composing Smart Setup...</span>
      `;
    }

    const data = await apiGenerateSetup({
      space: currentSpace,
      budget: currentBudget,
      owned_items: currentOwnedItems,
      style: currentStyle,
    });

    currentSetupTiers = data.tiers || [];
    setupResultsContainer.style.display = "block";
    renderTrustGuard(data.owned_summary);
    renderSetupTiers(0);
  } catch (err) {
    console.error("Failed to generate setup:", err);
  } finally {
    if (generateSetupBtn) {
      generateSetupBtn.disabled = false;
      generateSetupBtn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2L13.8 7.5a2 2 0 0 0 1.3 1.3L21 11l-5.9 2.2a2 2 0 0 0-1.3 1.3L12 20l-1.8-5.5a2 2 0 0 0-1.3-1.3L3 11l5.9-2.2a2 2 0 0 0 1.3-1.3L12 2Z"/>
        </svg>
        <span>Generate Deal-Verified Setup</span>
      `;
    }
  }
}

function renderTrustGuard(ownedSummary) {
  const banner = document.getElementById("trustGuardBanner");
  const savedPill = document.getElementById("trustGuardSavedPill");
  const desc = document.getElementById("trustGuardDesc");
  if (!banner) return;

  if (ownedSummary && ownedSummary.count > 0) {
    banner.style.display = "flex";
    if (savedPill) {
      savedPill.textContent = `Saved ₹${Number(ownedSummary.saved_amount).toLocaleString("en-IN")}`;
    }
    if (desc) {
      const itemsList = ownedSummary.item_names.join(", ");
      desc.innerHTML = `You already own <strong>${escapeHtml(itemsList)}</strong>. Unlike affiliate sites that push redundant products for commission, DealSense removed them from your cart and redirected <strong>₹${Number(ownedSummary.saved_amount).toLocaleString("en-IN")}</strong> toward higher-impact lighting and acoustic upgrades.`;
    }
  } else {
    banner.style.display = "none";
  }
}

function renderSetupTiers(tierIndex) {
  if (!currentSetupTiers || currentSetupTiers.length === 0) return;
  activeTierIdx = tierIndex;
  const activeTier = currentSetupTiers[tierIndex];

  const tierTabsBar = document.getElementById("tierTabsBar");
  const tierTotalCost = document.getElementById("tierTotalCost");
  const tierTotalSavings = document.getElementById("tierTotalSavings");
  const tierBudgetRemaining = document.getElementById("tierBudgetRemaining");
  const tierAllocationAdvice = document.getElementById("tierAllocationAdvice");
  const phase1Subtotal = document.getElementById("phase1Subtotal");
  const phase1Grid = document.getElementById("phase1Grid");
  const phase2Subtotal = document.getElementById("phase2Subtotal");
  const phase2Grid = document.getElementById("phase2Grid");
  const bottomBarTierTitle = document.getElementById("bottomBarTierTitle");
  const bottomBarItemCount = document.getElementById("bottomBarItemCount");
  const buyAllCost = document.getElementById("buyAllCost");

  // 1. Render Tier Tabs
  if (tierTabsBar) {
    tierTabsBar.innerHTML = currentSetupTiers.map((t, idx) => `
      <button type="button" class="tier-tab-btn ${idx === tierIndex ? 'active' : ''}" style="--tier-accent: ${t.color};" data-idx="${idx}">
        <div class="tier-tab-header">
          <span class="tier-tab-title">${t.title}</span>
          <span class="tier-tab-badge">${t.badge}</span>
        </div>
        <div class="tier-tab-price">₹${t.total_price.toLocaleString("en-IN")}</div>
      </button>
    `).join("");

    tierTabsBar.querySelectorAll(".tier-tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        renderSetupTiers(Number(btn.getAttribute("data-idx")));
      });
    });
  }

  // 2. Summary Banner
  if (tierTotalCost) tierTotalCost.textContent = `₹${activeTier.total_price.toLocaleString("en-IN")}`;
  if (tierTotalSavings) tierTotalSavings.textContent = `₹${activeTier.savings.toLocaleString("en-IN")}`;
  if (tierBudgetRemaining) {
    tierBudgetRemaining.textContent = activeTier.budget_diff >= 0
      ? `₹${activeTier.budget_diff.toLocaleString("en-IN")}`
      : `-₹${Math.abs(activeTier.budget_diff).toLocaleString("en-IN")}`;
    tierBudgetRemaining.style.color = activeTier.budget_diff >= 0 ? "#60A5FA" : "#F87171";
  }
  if (tierAllocationAdvice) tierAllocationAdvice.textContent = activeTier.allocation_advice;

  // 3. Render Phase 1 Cards
  if (phase1Subtotal) phase1Subtotal.textContent = `Subtotal: ₹${activeTier.phase1_total.toLocaleString("en-IN")}`;
  if (phase1Grid) {
    phase1Grid.innerHTML = activeTier.phase1_items.map((item) => renderSetupItemCard(item)).join("");
  }

  // 4. Render Phase 2 Cards
  if (phase2Subtotal) phase2Subtotal.textContent = `Subtotal: ₹${activeTier.phase2_total.toLocaleString("en-IN")}`;
  if (phase2Grid) {
    phase2Grid.innerHTML = activeTier.phase2_items.map((item) => renderSetupItemCard(item)).join("");
  }

  // 5. Bottom Checkout Bar
  if (bottomBarTierTitle) bottomBarTierTitle.textContent = activeTier.title;
  if (bottomBarItemCount) bottomBarItemCount.textContent = `${activeTier.all_items.length} items verified across Amazon, Flipkart & IKEA`;
  if (buyAllCost) buyAllCost.textContent = activeTier.total_price.toLocaleString("en-IN");
}

function renderSetupItemCard(item) {
  return `
    <div class="setup-item-card">
      <div class="setup-card-top">
        <span class="setup-cat-tag">${escapeHtml(item.category)}</span>
        <span class="setup-store-chip">
          <span style="font-weight:700;">${item.store}</span>
          <span style="color:#16A34A; font-size:10.5px; margin-left:4px;">✓ ${escapeHtml(item.deal_verdict)}</span>
        </span>
      </div>
      <img src="${item.image}" alt="${escapeHtml(item.name)}" class="setup-card-thumb" loading="lazy">
      <h4 class="setup-item-title">${escapeHtml(item.name)}</h4>
      <p class="setup-item-reason">${escapeHtml(item.reason)}</p>
      <div class="setup-card-price-row">
        <div class="setup-card-prices">
          <span class="setup-card-price">₹${item.price.toLocaleString("en-IN")}</span>
          <span class="setup-card-mrp">₹${item.mrp.toLocaleString("en-IN")}</span>
          <span style="color:#16A34A; font-size:11.5px; font-weight:700; margin-left:4px;">${item.discount_pct}% OFF</span>
        </div>
        <a href="${item.url}" target="_blank" rel="noopener sponsored" class="btn-buy-item">
          Buy →
        </a>
      </div>
    </div>
  `;
}
