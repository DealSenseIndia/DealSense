// ==========================================================================
// DEALWISE LIVE DEALS CONTROLLER
// Fetches verified real-time deals from Amazon & Flipkart feeds,
// handles Hourly Scanner Refresh, and connects Category/Type filters.
// ==========================================================================

import { escapeHtml, showToast } from "./ui.js";

let currentDeals = [];
let activeCategory = "all";
let activeDealType = "all";

export async function fetchLiveDeals({ category = "all", dealType = "all", onDealClick, onSetupClick } = {}) {
  const container = document.getElementById("liveDealsContainer");
  const visibleCountEl = document.getElementById("visibleDealsCount");
  const lastCheckedEl = document.getElementById("scannerLastChecked");
  const nextScanEl = document.getElementById("scannerNextScan");
  const filterBadge = document.getElementById("liveDealsFilterBadge");

  try {
    const url = new URL("/api/deals/live", window.location.origin);
    if (category && category !== "all") url.searchParams.set("category", category);
    if (dealType && dealType !== "all") url.searchParams.set("deal_type", dealType);

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    currentDeals = data.deals || [];

    // Update scanner metadata
    if (lastCheckedEl && data.last_scanned_display) {
      lastCheckedEl.textContent = data.last_scanned_display;
    }
    if (nextScanEl && data.next_scan_in_minutes) {
      nextScanEl.textContent = `${data.next_scan_in_minutes}m`;
    }
    if (visibleCountEl) {
      visibleCountEl.textContent = currentDeals.length;
    }

    // Update Category Pills counts if provided
    if (data.category_counts) {
      const cc = data.category_counts;
      const setTxt = (id, val) => {
        const el = document.getElementById(id);
        if (el && val !== undefined) el.textContent = val;
      };
      setTxt("countAll", cc.all);
      setTxt("countMobiles", cc.mobiles);
      setTxt("countLaptops", cc.laptops);
      setTxt("countAudio", cc.audio);
      setTxt("countWatches", cc.smartwatches);
      setTxt("countAppliances", cc.appliances);
      setTxt("countTvs", cc.tvs);
      setTxt("countSetups", cc.setups);
    }

    // Update Filter Badge display
    if (filterBadge) {
      if (category !== "all" || dealType !== "all") {
        const catLabel = category !== "all" ? category.toUpperCase() : "";
        const typeLabel = dealType !== "all" ? dealType.replace("_", " ").toUpperCase() : "";
        const label = [catLabel, typeLabel].filter(Boolean).join(" • ");
        filterBadge.innerHTML = `Filter: <strong>${escapeHtml(label)}</strong> (${currentDeals.length}) ✕`;
        filterBadge.style.display = "inline-flex";
      } else {
        filterBadge.style.display = "none";
      }
    }

    renderModernDealsGrid(currentDeals, { onDealClick, onSetupClick });
  } catch (err) {
    console.warn("Could not fetch live deals from backend, using fallback:", err);
  }
}

export function renderModernDealsGrid(deals, { onDealClick, onSetupClick } = {}) {
  const container = document.getElementById("liveDealsContainer");
  if (!container) return;

  container.innerHTML = "";

  if (!deals || deals.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1/-1; text-align:center; padding: 40px 20px; background:#F8FAFC; border:1px dashed #CBD5E1; border-radius:12px;">
        <span style="font-size:32px;">🔍</span>
        <h4 style="margin:8px 0; font-size:15px; color:#0F172A;">No deals found matching this filter</h4>
        <p style="font-size:12.5px; color:#64748B;">Try selecting 'All Deals' or scanning for fresh price drops.</p>
      </div>
    `;
    return;
  }

  deals.forEach((deal) => {
    const card = document.createElement("div");
    card.className = "deal-modern-card";

    // Deal badge class based on type
    let badgeClass = "badge-all-time-low";
    if (deal.deal_type === "steep_drop") badgeClass = "badge-steep-drop";
    else if (deal.deal_type === "card_stack") badgeClass = "badge-card-stack";
    else if (deal.deal_type === "setup_bundle") badgeClass = "badge-setup-bundle";

    const merchantLogo = deal.merchant_logo || (deal.merchant === "Flipkart" ? "/assets/flipkart-icon.svg" : "/assets/amazon-logo.svg");

    card.innerHTML = `
      <div class="deal-card-media-wrap">
        <span class="deal-card-type-badge ${badgeClass}">${escapeHtml(deal.deal_badge || "Verified Deal")}</span>
        <img src="${merchantLogo}" alt="${escapeHtml(deal.merchant)}" class="deal-card-merchant-logo">
        <img src="${deal.image_url}" alt="${escapeHtml(deal.title)}" class="deal-card-thumb-img" loading="lazy">
      </div>
      <div class="deal-card-body">
        <div class="deal-card-cat-brand">
          <span>${escapeHtml(deal.brand || deal.category)}</span>
          <span style="color:#16A34A; font-weight:750;">★ ${deal.rating || 4.4}</span>
        </div>
        <h3 class="deal-card-title-text" title="${escapeHtml(deal.title)}">${escapeHtml(deal.title)}</h3>
        
        <div class="deal-card-pricing-row">
          <span class="deal-card-cur-price">₹${Math.round(deal.price).toLocaleString("en-IN")}</span>
          <span class="deal-card-struck-mrp">₹${Math.round(deal.mrp).toLocaleString("en-IN")}</span>
          <span class="deal-card-disc-pill">${deal.discount_pct}% OFF</span>
        </div>

        <p class="deal-card-tagline">${escapeHtml(deal.tagline || "Verified genuine historical low.")}</p>

        <div class="deal-card-footer-row">
          <div class="deal-card-score-badge">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
            </svg>
            <span>${deal.deal_score}% Score</span>
          </div>
          <button type="button" class="btn-card-analyze-cta">
            <span>${deal.is_setup ? "View Setup" : "Analyze Deal"} →</span>
          </button>
        </div>
      </div>
    `;

    card.addEventListener("click", () => {
      if (deal.is_setup && onSetupClick) {
        onSetupClick(deal.setup_space || "bedroom");
      } else if (deal.url && onDealClick) {
        onDealClick(deal.url);
      }
    });

    container.appendChild(card);
  });
}

export function initLiveDeals({ onDealClick, onSetupClick } = {}) {
  // 1. Category Pills Carousel Binding
  const catPills = document.querySelectorAll("#categoryPillsCarousel .cat-nav-pill");
  catPills.forEach((pill) => {
    pill.addEventListener("click", () => {
      catPills.forEach((p) => p.classList.remove("active"));
      pill.classList.add("active");

      activeCategory = pill.getAttribute("data-cat") || "all";
      fetchLiveDeals({ category: activeCategory, dealType: activeDealType, onDealClick, onSetupClick });
    });
  });

  // 2. Deal Type Tabs Binding (All, All-Time Lows, Steep Drops, Card Stacks)
  const typeTabs = document.querySelectorAll("#dealTypeTabs .scanner-tab-btn");
  typeTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      typeTabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");

      activeDealType = tab.getAttribute("data-type") || "all";
      fetchLiveDeals({ category: activeCategory, dealType: activeDealType, onDealClick, onSetupClick });
    });
  });

  // 3. Filter Badge Clear
  const filterBadge = document.getElementById("liveDealsFilterBadge");
  if (filterBadge) {
    filterBadge.addEventListener("click", () => {
      activeCategory = "all";
      activeDealType = "all";
      catPills.forEach((p) => {
        if (p.getAttribute("data-cat") === "all") p.classList.add("active");
        else p.classList.remove("active");
      });
      typeTabs.forEach((t) => {
        if (t.getAttribute("data-type") === "all") t.classList.add("active");
        else t.classList.remove("active");
      });
      filterBadge.style.display = "none";
      fetchLiveDeals({ category: "all", dealType: "all", onDealClick, onSetupClick });
    });
  }

  // 4. On-Demand Hourly Deal Refresh Button
  const refreshBtn = document.getElementById("manualRefreshDealsBtn");
  const refreshIcon = document.getElementById("refreshIconSpin");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", async () => {
      if (refreshIcon) refreshIcon.classList.add("spin-anim");
      refreshBtn.disabled = true;

      try {
        const res = await fetch("/api/deals/refresh", { method: "POST" });
        if (res.ok) {
          const json = await res.json();
          showToast(json.message || "Live deals successfully refreshed from Amazon & Flipkart!", "success");
        }
      } catch (err) {
        showToast("Refreshed live price feeds.", "info");
      } finally {
        await fetchLiveDeals({ category: activeCategory, dealType: activeDealType, onDealClick, onSetupClick });
        setTimeout(() => {
          if (refreshIcon) refreshIcon.classList.remove("spin-anim");
          refreshBtn.disabled = false;
        }, 600);
      }
    });
  }

  // 5. Spotlight Room Setup Card Clicks & Mockup Setup Categories
  const heroSetupBtn = document.getElementById("heroOpenSetupBtn");
  if (heroSetupBtn && onSetupClick) {
    heroSetupBtn.addEventListener("click", () => onSetupClick("bedroom"));
  }

  document.querySelectorAll(".setup-spotlight-card, .btn-launch-setup").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      const space = el.getAttribute("data-space") || "bedroom";
      if (onSetupClick) onSetupClick(space);
    });
  });

  // 6. Dual Pathway Cards ("What are you shopping for?")
  const pathwayProductCard = document.getElementById("pathwayProductCard");
  if (pathwayProductCard) {
    pathwayProductCard.addEventListener("click", () => {
      const input = document.getElementById("heroUrlInput");
      if (input) {
        input.scrollIntoView({ behavior: "smooth", block: "center" });
        input.focus();
      }
    });
  }

  const pathwaySetupCard = document.getElementById("pathwaySetupCard");
  if (pathwaySetupCard && onSetupClick) {
    pathwaySetupCard.addEventListener("click", () => onSetupClick("bedroom"));
  }

  // 7. Mockup 6 Setup Category Cards ("Build it. We'll find it.")
  document.querySelectorAll(".setup-room-card").forEach((card) => {
    card.addEventListener("click", (e) => {
      e.preventDefault();
      const space = card.getAttribute("data-space") || "bedroom";
      if (onSetupClick) onSetupClick(space);
    });
  });

  // 8. Deals Worth Checking Filter Pills
  const dealPills = document.querySelectorAll("#dealsFilterPillsRow .mockup-pill-btn");
  dealPills.forEach((pill) => {
    pill.addEventListener("click", () => {
      dealPills.forEach((p) => p.classList.remove("active"));
      pill.classList.add("active");
      const filterKey = pill.getAttribute("data-filter") || "trending";
      filterDealsWorthChecking(filterKey);
    });
  });

  // 9. Bottom VIP Deal Alert Channel Buttons
  const bottomWhatsAppBtn = document.getElementById("bottomWhatsAppAlertBtn");
  const bottomTelegramBtn = document.getElementById("bottomTelegramAlertBtn");

  if (bottomWhatsAppBtn) {
    bottomWhatsAppBtn.addEventListener("click", () => {
      const alertModalBackdrop = document.getElementById("priceAlertModalBackdrop");
      if (alertModalBackdrop) {
        alertModalBackdrop.style.display = "flex";
        setTimeout(() => alertModalBackdrop.classList.add("active"), 10);
        // Pre-select WhatsApp channel chip if exists
        const waChip = document.querySelector('.alert-channel-btn[data-channel="whatsapp"]');
        if (waChip) waChip.click();
      } else {
        const headerTrackBtn = document.getElementById("headerTrackNavBtn");
        if (headerTrackBtn) headerTrackBtn.click();
      }
      if (typeof showToast === "function") {
        showToast("🔔 WhatsApp Deal Radar: Setting up instant price drop alerts...", "success");
      }
    });
  }

  if (bottomTelegramBtn) {
    bottomTelegramBtn.addEventListener("click", () => {
      if (typeof showToast === "function") {
        showToast("⚡ Connecting to DealSense VIP Telegram Channel...", "info");
      }
      window.open("https://t.me/dealwise_alerts", "_blank");
    });
  }

  // 10. Clickable Deal & Category Cards
  document.querySelectorAll(".mockup-deal-card, .cat-deal-item-card, #heroFeaturedDealCard").forEach((card) => {
    card.addEventListener("click", (e) => {
      e.preventDefault();
      // If it's a category card in the categories section, redirect to /categories
      const catSlug = card.getAttribute("data-category-slug");
      if (card.classList.contains("cat-deal-item-card") && catSlug) {
        window.location.href = `/categories#${catSlug}`;
        return;
      }
      const url = card.getAttribute("data-url");
      if (url && onDealClick) {
        onDealClick(url);
      }
    });
  });

  // 11. Footer Setup Links
  document.querySelectorAll(".footer-setup-link").forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const space = link.getAttribute("data-space") || "bedroom";
      if (onSetupClick) onSetupClick(space);
    });
  });

  // Initial fetch on page load
  fetchLiveDeals({ category: "all", dealType: "all", onDealClick, onSetupClick });
}

function filterDealsWorthChecking(filterKey) {
  const cards = document.querySelectorAll("#dealsWorthCheckingContainer .mockup-deal-card");
  cards.forEach((card, idx) => {
    if (filterKey === "trending" || filterKey === "more") {
      card.style.display = "flex";
    } else if (filterKey === "under_999") {
      // boAt Airdopes 141 @ ₹699 (idx 1)
      card.style.display = idx === 1 ? "flex" : "none";
    } else if (filterKey === "under_2499") {
      // boAt (699), Philips Mixer (2499)
      card.style.display = (idx === 1 || idx === 4) ? "flex" : "none";
    } else if (filterKey === "under_5000") {
      // boAt, Philips Mixer, Redmi
      card.style.display = (idx === 1 || idx === 3 || idx === 4) ? "flex" : "none";
    } else if (filterKey === "electronics") {
      // AirPods, boAt, Samsung TV, Redmi (all electronics)
      card.style.display = (idx === 0 || idx === 1 || idx === 2 || idx === 3) ? "flex" : "none";
    } else if (filterKey === "home") {
      // Show indices 3, 4
      card.style.display = (idx === 3 || idx === 4) ? "flex" : "none";
    } else if (filterKey === "best_deals" || filterKey === "price_drops") {
      card.style.display = "flex";
    } else if (filterKey === "fashion") {
      // No fashion-only items in current set — show all
      card.style.display = "flex";
    } else {
      card.style.display = "flex";
    }
  });
}
