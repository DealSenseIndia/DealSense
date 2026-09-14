// ==========================================================================
// DEALSENSE VIEW ROUTER & NAVIGATION MODULE
//
// Hash-based SPA router. Every view has a URL:
//   #/           → Homepage
//   #/product    → Product Detail (after analysis)
//   #/setup      → Smart Setup Builder
//   #/deals      → Deals feed (redirects to /deals page)
//   #/categories → Categories (redirects to /categories page)
//   #/track      → Tracked products & alerts
//
// Back button, deep links, and sharing all work.
// ==========================================================================

export function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function showToast(message, type = "info") {
  let toast = document.getElementById("dwToastNotification");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "dwToastNotification";
    toast.style.cssText = `
      position: fixed;
      bottom: 28px;
      right: 28px;
      background: #0F172A;
      color: #FFFFFF;
      padding: 14px 22px;
      border-radius: 12px;
      font-size: 13.5px;
      font-weight: 600;
      box-shadow: 0 10px 30px rgba(0,0,0,0.22);
      z-index: 99999;
      display: flex;
      align-items: center;
      gap: 10px;
      transition: opacity 0.25s ease, transform 0.25s ease;
      max-width: 440px;
    `;
    document.body.appendChild(toast);
  }
  toast.style.background = type === "error" ? "#DC2626" : (type === "success" ? "#16A34A" : "#0F172A");
  toast.textContent = message;
  toast.style.opacity = "1";
  toast.style.transform = "translateY(0)";
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(12px)";
  }, 4500);
}


// ─────────────── Mobile Menu ───────────────

function initMobileMenu() {
  const hamburger = document.getElementById("mobileMenuBtn");
  const drawer = document.getElementById("mobileDrawer");
  const overlay = document.getElementById("mobileDrawerOverlay");
  const closeBtn = document.getElementById("mobileDrawerClose");

  if (!hamburger || !drawer) return;

  function openDrawer() {
    drawer.style.display = "flex";
    if (overlay) overlay.style.display = "block";
    requestAnimationFrame(() => {
      drawer.classList.add("open");
      if (overlay) overlay.classList.add("open");
    });
    document.body.style.overflow = "hidden";
  }

  function closeDrawer() {
    drawer.classList.remove("open");
    if (overlay) overlay.classList.remove("open");
    document.body.style.overflow = "";
    setTimeout(() => {
      if (!drawer.classList.contains("open")) {
        drawer.style.display = "none";
        if (overlay) overlay.style.display = "none";
      }
    }, 280);
  }

  hamburger.addEventListener("click", openDrawer);
  if (closeBtn) closeBtn.addEventListener("click", closeDrawer);
  if (overlay) overlay.addEventListener("click", closeDrawer);

  // Close on nav link click inside drawer
  drawer.querySelectorAll("a, button").forEach((el) => {
    el.addEventListener("click", () => {
      setTimeout(closeDrawer, 150);
    });
  });
}


// ─────────────── View Router ───────────────

export function initNavigation({ onShowSetup, onShowTrack } = {}) {
  const homeView = document.getElementById("homeView");
  const detailView = document.getElementById("detailView");
  const setupView = document.getElementById("setupView");
  const trackView = document.getElementById("trackView");

  const navLogoBtn = document.getElementById("navLogoBtn");
  const homeNavBtn = document.getElementById("homeNavBtn");
  const setupNavBtn = document.getElementById("setupNavBtn");
  const headerPriceHistoryBtn = document.getElementById("headerPriceHistoryBtn");
  const modeAnalyzeBtn = document.getElementById("modeAnalyzeBtn");
  const modeSetupBtn = document.getElementById("modeSetupBtn");
  const backToHomeBreadcrumb = document.getElementById("backToHomeBreadcrumb");
  const heroUrlInput = document.getElementById("heroUrlInput");
  const headerTrackNavBtn = document.getElementById("headerTrackNavBtn");
  const dealsNavBtn = document.getElementById("dealsNavBtn");

  // Mobile nav links
  const mobileHomeBtn = document.getElementById("mobileHomeBtn");
  const mobileSetupBtn = document.getElementById("mobileSetupBtn");
  const mobileTrackBtn = document.getElementById("mobileTrackBtn");
  const mobileDealsBtn = document.getElementById("mobileDealsBtn");

  function clearActive() {
    [homeNavBtn, setupNavBtn, headerTrackNavBtn, dealsNavBtn].forEach(btn => {
      if (btn) btn.classList.remove("active");
    });
  }

  function showHome(pushState = true) {
    if (homeView) homeView.style.display = "block";
    if (detailView) detailView.style.display = "none";
    if (setupView) setupView.style.display = "none";
    if (trackView) trackView.style.display = "none";
    clearActive();
    if (homeNavBtn) homeNavBtn.classList.add("active");
    if (modeAnalyzeBtn) modeAnalyzeBtn.classList.add("active");
    if (modeSetupBtn) modeSetupBtn.classList.remove("active");
    if (pushState) {
      if (window.location.search || window.location.hash) {
        window.history.pushState({}, "", window.location.pathname);
      }
      document.title = "DealSense — Smart Shopping & Deal Verification for India";
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function showDetail(pushState = true) {
    if (homeView) homeView.style.display = "none";
    if (detailView) detailView.style.display = "block";
    if (setupView) setupView.style.display = "none";
    if (trackView) trackView.style.display = "none";
    clearActive();
    if (pushState && !window.location.search) {
      window.location.hash = "#/product";
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function showSetup(pushState = true) {
    if (homeView) homeView.style.display = "none";
    if (detailView) detailView.style.display = "none";
    if (setupView) setupView.style.display = "block";
    if (trackView) trackView.style.display = "none";
    clearActive();
    if (setupNavBtn) setupNavBtn.classList.add("active");
    if (modeAnalyzeBtn) modeAnalyzeBtn.classList.remove("active");
    if (modeSetupBtn) modeSetupBtn.classList.add("active");
    if (pushState) window.location.hash = "#/setup";
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (onShowSetup) onShowSetup();
  }

  function showTrack(pushState = true) {
    if (onShowTrack) {
      onShowTrack();
    } else if (trackView) {
      if (homeView) homeView.style.display = "none";
      if (detailView) detailView.style.display = "none";
      if (setupView) setupView.style.display = "none";
      trackView.style.display = "block";
      clearActive();
      if (headerTrackNavBtn) headerTrackNavBtn.classList.add("active");
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
    if (pushState) window.location.hash = "#/track";
  }

  function showDeals(pushState = true) {
    if (homeView) homeView.style.display = "block";
    if (detailView) detailView.style.display = "none";
    if (setupView) setupView.style.display = "none";
    if (trackView) trackView.style.display = "none";
    clearActive();
    if (dealsNavBtn) dealsNavBtn.classList.add("active");
    if (pushState) window.location.hash = "#liveDeals";
    const liveDealsSec = document.getElementById("liveDeals");
    if (liveDealsSec) {
      setTimeout(() => liveDealsSec.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    }
  }

  // ── Event listeners ──
  if (navLogoBtn) navLogoBtn.addEventListener("click", (e) => { e.preventDefault(); showHome(); });
  if (homeNavBtn) homeNavBtn.addEventListener("click", (e) => { e.preventDefault(); showHome(); });
  if (setupNavBtn) setupNavBtn.addEventListener("click", (e) => { e.preventDefault(); showSetup(); });
  if (modeSetupBtn) modeSetupBtn.addEventListener("click", (e) => { e.preventDefault(); showSetup(); });
  if (headerPriceHistoryBtn) {
    headerPriceHistoryBtn.addEventListener("click", (e) => {
      e.preventDefault();
      showHome();
      if (heroUrlInput) {
        heroUrlInput.focus();
        heroUrlInput.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });
  }
  if (modeAnalyzeBtn) modeAnalyzeBtn.addEventListener("click", (e) => {
    e.preventDefault();
    showHome();
    if (heroUrlInput) {
      heroUrlInput.focus();
      heroUrlInput.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  });
  if (backToHomeBreadcrumb) backToHomeBreadcrumb.addEventListener("click", (e) => { e.preventDefault(); showHome(); });
  if (headerTrackNavBtn) headerTrackNavBtn.addEventListener("click", (e) => { e.preventDefault(); showTrack(); });
  if (dealsNavBtn) dealsNavBtn.addEventListener("click", (e) => { e.preventDefault(); showDeals(); });

  // Mobile nav
  if (mobileHomeBtn) mobileHomeBtn.addEventListener("click", (e) => { e.preventDefault(); showHome(); });
  if (mobileSetupBtn) mobileSetupBtn.addEventListener("click", (e) => { e.preventDefault(); showSetup(); });
  if (mobileTrackBtn) mobileTrackBtn.addEventListener("click", (e) => { e.preventDefault(); showTrack(); });
  if (mobileDealsBtn) mobileDealsBtn.addEventListener("click", (e) => { e.preventDefault(); showDeals(); });

  // ── Hash-based routing ──
  function handleHashRoute() {
    const hash = window.location.hash || "#/";
    if (hash.startsWith("#/product")) {
      showDetail(false);
    } else if (hash.startsWith("#/setup")) {
      showSetup(false);
    } else if (hash.startsWith("#/track")) {
      showTrack(false);
    } else if (hash === "#liveDeals" || hash === "#deals" || hash === "#/deals") {
      showDeals(false);
    } else {
      showHome(false);
    }
  }

  window.addEventListener("hashchange", handleHashRoute);

  // Initialize mobile menu
  initMobileMenu();

  return { showHome, showDetail, showSetup, showTrack, showDeals, handleHashRoute };
}

