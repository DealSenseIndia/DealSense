// ==========================================================================
// DEALWISE MASTER ORCHESTRATOR (ES MODULE ENTRY)
// Lightweight entry point coordinating specialized modular subsystems.
// ==========================================================================

import { initNavigation, showToast } from "./js/ui.js";
import { checkDeal } from "./js/api.js";
import { startAnalyzingAnimation, finishAnalyzingAnimation } from "./js/animations.js";
import { initRecentProduct, saveRecentProduct } from "./js/recent.js";
import { initOmniSearch } from "./js/search.js";
import { renderDetailPage, initPdpListeners } from "./js/pdp.js";
import { initSetupBuilder } from "./js/setup_builder.js";
import { initLiveDeals } from "./js/live_deals.js";
import { initTrackedDealsDrawer } from "./js/tracked_deals.js";

document.addEventListener("DOMContentLoaded", () => {
  // 1. Initialize View Router & Navigation
  let setupInitialized = false;
  const nav = initNavigation({
    onShowSetup: () => {
      if (!setupInitialized) {
        initSetupBuilder();
        setupInitialized = true;
      }
    },
  });

  // Check for Setup Deep Link in URL (e.g. ?space=living_room&budget=25000)
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has("space") || urlParams.get("view") === "setup") {
    nav.showSetup();
    if (!setupInitialized) {
      initSetupBuilder();
      setupInitialized = true;
    }
  }

  // 2. DOM References for Hero & Omni-Search
  const heroUrlInput = document.getElementById("heroUrlInput");
  const heroSubmitBtn = document.getElementById("heroSubmitBtn");
  const heroDealForm = document.getElementById("heroDealForm");
  const searchResultsDropdown = document.getElementById("searchResultsDropdown");
  const searchResultsList = document.getElementById("searchResultsList");
  const chipTriggers = document.querySelectorAll(".chip-trigger");

  // 3. Centralized URL Deal Analysis Controller
  async function analyzeUrl(url) {
    if (!url) return;
    if (searchResultsDropdown) searchResultsDropdown.style.display = "none";
    const headerDropdown = document.getElementById("headerSearchDropdown");
    if (headerDropdown) headerDropdown.style.display = "none";

    startAnalyzingAnimation(heroSubmitBtn);

    try {
      const data = await checkDeal(url);
      finishAnalyzingAnimation(heroSubmitBtn, true, () => {
        saveRecentProduct(data, url);
        renderDetailPage(data, { onAnalyzeUrl: analyzeUrl });
        nav.showDetail();
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    } catch (err) {
      console.error("Deal analysis error:", err);
      finishAnalyzingAnimation(heroSubmitBtn, false, () => {
        showToast(`Deal Analysis: ${err.message || "Failed to analyze link"}`, "error");
      });
    }
  }

  // 4. Initialize Omni-Search & Autocomplete Subsystem
  const searchModule = initOmniSearch({
    heroUrlInput,
    heroDealForm,
    searchResultsDropdown,
    searchResultsList,
    chipTriggers,
    onAnalyze: analyzeUrl,
  });

  // 5. Featured Hero Card Click (Apple Watch Series 9)
  const heroFeaturedViewBtn = document.getElementById("heroFeaturedViewBtn");
  const heroFeaturedDealCard = document.getElementById("heroFeaturedDealCard");

  if (heroFeaturedViewBtn) {
    heroFeaturedViewBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const url = heroFeaturedViewBtn.getAttribute("data-url");
      if (heroUrlInput) heroUrlInput.value = url;
      analyzeUrl(url);
    });
  }

  if (heroFeaturedDealCard) {
    heroFeaturedDealCard.addEventListener("click", () => {
      const url = heroFeaturedDealCard.getAttribute("data-url");
      if (heroUrlInput) heroUrlInput.value = url;
      analyzeUrl(url);
    });
  }

  // 6. Initialize Product Detail Page (Tabs & Bank Calculators)
  initPdpListeners();

  // 7. Initialize Dynamic Recent Product from LocalStorage
  initRecentProduct();

  // 8. Initialize Live Deals Stack & Category Filters
  initLiveDeals({
    onDealClick: (dealUrl) => {
      if (heroUrlInput) heroUrlInput.value = dealUrl;
      analyzeUrl(dealUrl);
    },
    onSetupClick: (space) => {
      nav.showSetup();
      if (!setupInitialized) {
        initSetupBuilder();
        setupInitialized = true;
      }
      const card = document.querySelector(`.space-card[data-space="${space}"]`);
      if (card) card.click();
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
  });

  // 9. Initialize Tracked Deals & Watchlist Drawer
  initTrackedDealsDrawer({ onAnalyzeUrl: analyzeUrl });

  // 10. Homepage Data Hydration — /api/homepage contract
  // Fetches live stats and hydrates footer stat numbers dynamically.
  // Falls back silently if backend is unavailable (static HTML values remain).
  (async () => {
    try {
      const res = await fetch("/api/homepage");
      if (!res.ok) return;
      const data = await res.json();

      // Hydrate footer stats if API returns fresh values
      if (data.stats) {
        const s = data.stats;
        const setStatEl = (selector, value) => {
          const el = document.querySelector(selector);
          if (el && value) el.textContent = value;
        };
        // Update footer stat numbers (matching footer.html structure)
        const statHighlights = document.querySelectorAll(".stat-num-highlight");
        if (statHighlights.length >= 4) {
          if (s.shoppers_count) statHighlights[0].textContent = s.shoppers_count;
          if (s.total_savings)  statHighlights[1].textContent = s.total_savings;
          if (s.fake_discounts_flagged) statHighlights[2].textContent = s.fake_discounts_flagged;
          if (s.daily_checks)  statHighlights[3].textContent = s.daily_checks;
        }
      }
    } catch (_) {
      // Silent fallback — static HTML values remain displayed
    }
  })();
});
