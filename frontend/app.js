// ==========================================================================
// DEALSENSE MASTER ORCHESTRATOR (ES MODULE ENTRY)
// Lightweight entry point coordinating specialized modular subsystems.
// ==========================================================================

import { initNavigation, showToast } from "./js/ui.js";
import { checkDeal } from "./js/api.js";
import { startAnalyzingAnimation, finishAnalyzingAnimation } from "./js/animations.js";
import { initRecentProduct, saveRecentProduct } from "./js/recent.js";
import { initOmniSearch } from "./js/search.js";
import { renderDetailPage, initPdpListeners, showPdpSkeleton, hidePdpSkeleton } from "./js/pdp.js";
import { ensureSetupBuilder, selectSpace } from "./js/setup_builder.js";
import { initLiveDeals } from "./js/live_deals.js";
import { initTrackedDealsDrawer } from "./js/tracked_deals.js";

function initApp() {
  let trackedDrawer = null;

  // 1. Initialize View Router & Navigation
  const nav = initNavigation({
    onShowSetup: () => {
      ensureSetupBuilder();
    },
    onShowTrack: () => {
      if (trackedDrawer && trackedDrawer.openDrawer) {
        trackedDrawer.openDrawer();
      }
    },
  });

  // 2. Handle initial route from URL
  const hash = window.location.hash || "#/";
  const urlParams = new URLSearchParams(window.location.search);

  // Legacy deep links from query params (e.g. ?space=living_room&budget=25000)
  if (urlParams.has("space") || urlParams.get("view") === "setup") {
    window.location.hash = "#/setup";
    nav.showSetup();
    const deepSpace = urlParams.get("space");
    if (deepSpace) {
      selectSpace(deepSpace, urlParams.get("budget"));
    } else {
      ensureSetupBuilder();
    }
  } else {
    // Route based on hash
    nav.handleHashRoute();
  }

  // 3. DOM References for Hero & Omni-Search
  const heroUrlInput = document.getElementById("heroUrlInput");
  const heroSubmitBtn = document.getElementById("heroSubmitBtn");
  const heroDealForm = document.getElementById("heroDealForm");
  const searchResultsDropdown = document.getElementById("searchResultsDropdown");
  const searchResultsList = document.getElementById("searchResultsList");
  const chipTriggers = document.querySelectorAll(".chip-trigger, .popular-tag-pill");

  // 4. Centralized URL Deal Analysis Controller
  async function analyzeUrl(url, { updateUrl = true } = {}) {
    if (!url) return;
    if (searchResultsDropdown) searchResultsDropdown.style.display = "none";
    const headerDropdown = document.getElementById("headerSearchDropdown");
    if (headerDropdown) headerDropdown.style.display = "none";

    const homeView = document.getElementById("homeView");
    const isHomeVisible = homeView && homeView.style.display !== "none";

    if (isHomeVisible) {
      startAnalyzingAnimation(heroSubmitBtn);
    } else {
      showPdpSkeleton();
    }

    try {
      const minAnimDelay = isHomeVisible ? 1250 : 0;
      const [data] = await Promise.all([
        checkDeal(url),
        new Promise((resolve) => setTimeout(resolve, minAnimDelay)),
      ]);

      const onAnalysisComplete = () => {
        saveRecentProduct(data, url);
        hidePdpSkeleton();
        try {
          renderDetailPage(data, { onAnalyzeUrl: analyzeUrl });
        } catch (renderErr) {
          console.error("Error inside renderDetailPage:", renderErr);
        }
        nav.showDetail(false);

        // Update URL query parameters and document title for instant shareability
        const asin = data.listing?.merchant_product_id;
        const title = data.product?.title || data.product?.canonical_title || "Product";
        if (updateUrl) {
          const shareQuery = asin ? `?p=${encodeURIComponent(asin)}` : `?url=${encodeURIComponent(url)}`;
          window.history.pushState({ p: asin, url, isPdp: true }, "", shareQuery);
        }
        document.title = `${title} — Real Price & Deal Intelligence | DealSense`;
      };

      if (isHomeVisible && heroSubmitBtn) {
        finishAnalyzingAnimation(heroSubmitBtn, true, onAnalysisComplete);
      } else {
        onAnalysisComplete();
      }
    } catch (err) {
      console.error("Deal analysis error:", err);
      if (isHomeVisible && heroSubmitBtn) {
        finishAnalyzingAnimation(heroSubmitBtn, false, () => {
          showToast(`Deal Analysis: ${err.message || "Failed to analyze link"}`, "error");
        });
      } else {
        hidePdpSkeleton();
        nav.showHome();
        showToast(`Deal Analysis: ${err.message || "Failed to analyze link"}`, "error");
      }
    }
  }

  // Automatic Deep Link Product Analysis (?p=... or ?url=... or ?id=... or /product/11)
  let initialDeepUrl = null;
  const currentParams = new URLSearchParams(window.location.search);
  const pathname = window.location.pathname;

  if (currentParams.has("p") || currentParams.has("asin")) {
    const pId = (currentParams.get("p") || currentParams.get("asin")).trim();
    if (/^[A-Z0-9]{10}$/i.test(pId)) {
      initialDeepUrl = `https://www.amazon.in/dp/${pId}`;
    } else if (/^itm/i.test(pId)) {
      initialDeepUrl = `https://www.flipkart.com/product/p/${pId}`;
    } else {
      initialDeepUrl = `https://www.amazon.in/dp/${pId}`;
    }
  } else if (currentParams.has("url")) {
    const rawUrl = currentParams.get("url").trim();
    if (rawUrl) initialDeepUrl = rawUrl;
  } else if (currentParams.has("id")) {
    const prodId = currentParams.get("id").trim();
    if (/^\d+$/.test(prodId)) {
      fetch(`/api/products/${prodId}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((pData) => {
          const firstUrl = pData?.listings?.[0]?.url;
          if (firstUrl) {
            if (heroUrlInput) heroUrlInput.value = firstUrl;
            analyzeUrl(firstUrl, { updateUrl: false });
          }
        })
        .catch(() => {});
    }
  } else if (pathname && pathname.startsWith("/product/")) {
    const productTarget = pathname.replace(/^\/product\/?/, "").trim();
    if (productTarget) {
      if (/^\d+$/.test(productTarget)) {
        fetch(`/api/products/${productTarget}`)
          .then((res) => (res.ok ? res.json() : null))
          .then((pData) => {
            const firstUrl = pData?.listings?.[0]?.url;
            if (firstUrl) {
              if (heroUrlInput) heroUrlInput.value = firstUrl;
              analyzeUrl(firstUrl, { updateUrl: false });
            }
          })
          .catch(() => {});
      } else {
        initialDeepUrl = productTarget;
      }
    }
  }

  if (initialDeepUrl) {
    if (heroUrlInput) heroUrlInput.value = initialDeepUrl;
    showPdpSkeleton();
    nav.showDetail(false);
    setTimeout(() => analyzeUrl(initialDeepUrl, { updateUrl: false }), 40);
  }

  // Browser History Navigation (Back / Forward)
  window.addEventListener("popstate", () => {
    const p = new URLSearchParams(window.location.search);
    if (p.has("p") || p.has("asin") || p.has("url")) {
      const pId = p.get("p") || p.get("asin");
      const targetUrl = p.get("url") || `https://www.amazon.in/dp/${pId}`;
      analyzeUrl(targetUrl, { updateUrl: false });
    } else {
      nav.showHome(false);
      document.title = "DealSense — Smart Shopping & Deal Verification for India";
    }
  });

  // 5. Initialize Omni-Search & Autocomplete Subsystem
  const searchModule = initOmniSearch({
    heroUrlInput,
    heroDealForm,
    searchResultsDropdown,
    searchResultsList,
    chipTriggers,
    onAnalyze: analyzeUrl,
  });

  // 6. Featured Hero Card Click (Apple Watch Series 9)
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

  // 7. Initialize Product Detail Page (Tabs & Bank Calculators)
  initPdpListeners();

  // 8. Initialize Dynamic Recent Product from LocalStorage
  initRecentProduct();

  // 9. Initialize Live Deals Stack & Category Filters
  initLiveDeals({
    onDealClick: (dealUrl) => {
      if (heroUrlInput) heroUrlInput.value = dealUrl;
      analyzeUrl(dealUrl);
    },
    onSetupClick: (space, budget = null) => {
      nav.showSetup();
      selectSpace(space, budget);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
  });

  // 10. Initialize Tracked Deals & Watchlist Drawer
  trackedDrawer = initTrackedDealsDrawer({ onAnalyzeUrl: analyzeUrl });

  // 11. Homepage Data Hydration — real stats from /api/homepage
  (async () => {
    try {
      const res = await fetch("/api/homepage");
      if (!res.ok) return;
      const data = await res.json();

      if (data.stats) {
        const s = data.stats;
        // Update stats bar with real numbers
        const statsBar = document.getElementById("statsBar");
        if (statsBar) {
          const items = statsBar.querySelectorAll(".stat-value");
          if (items.length >= 3) {
            items[0].textContent = s.products_tracked || "0";
            items[1].textContent = s.price_checks || "0";
            items[2].textContent = s.merchants_monitored || "2";
          }
        }

        // Update footer stats if they exist
        const statHighlights = document.querySelectorAll(".stat-num-highlight");
        if (statHighlights.length >= 3) {
          if (s.products_tracked) statHighlights[0].textContent = s.products_tracked;
          if (s.price_checks) statHighlights[1].textContent = s.price_checks;
          if (s.listings_count) statHighlights[2].textContent = s.listings_count;
        }
      }
    } catch (_) {
      // Silent fallback — static HTML values remain displayed
    }
  })();

  // 12. Dual Shopping Pathway Cards ("What are you shopping for?")
  const pathwayProductCard = document.getElementById("pathwayProductCard");
  const pathwayProductBtn = document.getElementById("pathwayProductBtn");
  const pathwaySetupCard = document.getElementById("pathwaySetupCard");
  const pathwaySetupBtn = document.getElementById("pathwaySetupBtn");

  function triggerProductPathway() {
    nav.showHome();
    if (heroUrlInput) {
      heroUrlInput.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => {
        heroUrlInput.focus();
        if (heroDealForm) {
          heroDealForm.classList.add("pulse-focus");
          setTimeout(() => heroDealForm.classList.remove("pulse-focus"), 1200);
        }
      }, 300);
    }
  }

  function triggerSetupPathway() {
    nav.showSetup();
    ensureSetupBuilder();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  [pathwayProductCard, pathwayProductBtn].forEach((el) => {
    if (!el) return;
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      triggerProductPathway();
    });
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        triggerProductPathway();
      }
    });
  });

  [pathwaySetupCard, pathwaySetupBtn].forEach((el) => {
    if (!el) return;
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      triggerSetupPathway();
    });
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        triggerSetupPathway();
      }
    });
  });

  // 13. Setup Card Clicks from Homepage
  document.querySelectorAll(".setup-room-card, [data-space], [data-setup-space]").forEach((card) => {
    card.addEventListener("click", (e) => {
      e.preventDefault();
      const space = card.getAttribute("data-space") || card.getAttribute("data-setup-space");
      const budget = card.getAttribute("data-budget") || card.getAttribute("data-setup-budget");
      nav.showSetup();
      selectSpace(space, budget);
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}
