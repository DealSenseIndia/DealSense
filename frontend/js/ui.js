// ==========================================================================
// DEALWISE UI & VIEW ROUTER MODULE
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

export function initNavigation({ onShowSetup }) {
  const homeView = document.getElementById("homeView");
  const detailView = document.getElementById("detailView");
  const setupView = document.getElementById("setupView");

  const navLogoBtn = document.getElementById("navLogoBtn");
  const homeNavBtn = document.getElementById("homeNavBtn");
  const setupNavBtn = document.getElementById("setupNavBtn");
  const modeAnalyzeBtn = document.getElementById("modeAnalyzeBtn");
  const modeSetupBtn = document.getElementById("modeSetupBtn");
  const backToHomeBreadcrumb = document.getElementById("backToHomeBreadcrumb");
  const heroUrlInput = document.getElementById("heroUrlInput");

  function showHome() {
    if (homeView) homeView.style.display = "block";
    if (detailView) detailView.style.display = "none";
    if (setupView) setupView.style.display = "none";
    if (homeNavBtn) homeNavBtn.classList.add("active");
    if (setupNavBtn) setupNavBtn.classList.remove("active");
    if (modeAnalyzeBtn) modeAnalyzeBtn.classList.add("active");
    if (modeSetupBtn) modeSetupBtn.classList.remove("active");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function showDetail() {
    if (homeView) homeView.style.display = "none";
    if (detailView) detailView.style.display = "block";
    if (setupView) setupView.style.display = "none";
    if (homeNavBtn) homeNavBtn.classList.remove("active");
    if (setupNavBtn) setupNavBtn.classList.remove("active");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function showSetup() {
    if (homeView) homeView.style.display = "none";
    if (detailView) detailView.style.display = "none";
    if (setupView) setupView.style.display = "block";
    if (homeNavBtn) homeNavBtn.classList.remove("active");
    if (setupNavBtn) setupNavBtn.classList.add("active");
    if (modeAnalyzeBtn) modeAnalyzeBtn.classList.remove("active");
    if (modeSetupBtn) modeSetupBtn.classList.add("active");
    window.scrollTo({ top: 0, behavior: "smooth" });

    if (onShowSetup) onShowSetup();
  }

  // dealsNavBtn naturally navigates to /deals (dedicated Deals page)

  if (navLogoBtn) navLogoBtn.addEventListener("click", (e) => { e.preventDefault(); showHome(); });
  if (homeNavBtn) homeNavBtn.addEventListener("click", (e) => { e.preventDefault(); showHome(); });
  if (setupNavBtn) setupNavBtn.addEventListener("click", (e) => { e.preventDefault(); showSetup(); });
  if (modeSetupBtn) modeSetupBtn.addEventListener("click", (e) => { e.preventDefault(); showSetup(); });
  if (modeAnalyzeBtn) modeAnalyzeBtn.addEventListener("click", (e) => {
    e.preventDefault();
    showHome();
    if (heroUrlInput) heroUrlInput.focus();
  });
  if (backToHomeBreadcrumb) backToHomeBreadcrumb.addEventListener("click", (e) => { e.preventDefault(); showHome(); });

  return { showHome, showDetail, showSetup };
}
