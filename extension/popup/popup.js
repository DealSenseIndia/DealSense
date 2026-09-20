/**
 * DealSense Action Popup Controller
 * Manages tab switching, active tab e-commerce detection,
 * instant product analysis, watchlist management, and settings configuration.
 */

document.addEventListener("DOMContentLoaded", async () => {
  // Elements
  const statusDot = document.getElementById("ds-status-dot");
  const tabs = document.querySelectorAll(".ds-tab");
  const views = document.querySelectorAll(".ds-view");
  const settingsToggle = document.getElementById("ds-settings-toggle");

  const urlInput = document.getElementById("ds-url-input");
  const analyzeBtn = document.getElementById("ds-analyze-btn");
  const activeTabBanner = document.getElementById("ds-active-tab-banner");
  const detectedTitle = document.getElementById("ds-detected-title");
  const quickScanBtn = document.getElementById("ds-quick-scan-btn");
  const resultContainer = document.getElementById("ds-result-container");
  const placeholder = document.getElementById("ds-placeholder");

  const watchlistList = document.getElementById("ds-watchlist-list");
  const watchlistCount = document.getElementById("ds-watchlist-count");
  const clearWatchlistBtn = document.getElementById("ds-clear-watchlist-btn");

  const apiBaseInput = document.getElementById("ds-setting-api-base");
  const channelSelect = document.getElementById("ds-setting-channel");
  const contactInput = document.getElementById("ds-setting-contact");
  const saveSettingsBtn = document.getElementById("ds-save-settings-btn");
  const settingsStatus = document.getElementById("ds-settings-status");

  let currentSettings = { apiBase: "http://localhost:8000" };

  // --------------------------------------------------------------------------
  // Tab Switching
  // --------------------------------------------------------------------------
  function switchTab(targetName) {
    tabs.forEach(t => t.classList.toggle("active", t.dataset.tab === targetName));
    views.forEach(v => v.classList.toggle("active", v.id === `view-${targetName}`));
    if (targetName === "watchlist") loadWatchlist();
    if (targetName === "settings") loadSettings();
  }

  tabs.forEach(tab => {
    tab.addEventListener("click", () => switchTab(tab.dataset.tab));
  });

  if (settingsToggle) {
    settingsToggle.addEventListener("click", () => switchTab("settings"));
  }

  // --------------------------------------------------------------------------
  // Backend Health Ping
  // --------------------------------------------------------------------------
  async function checkHealth(apiBase) {
    try {
      const resp = await fetch(`${apiBase.replace(/\/$/, "")}/api/health`, { method: "GET" });
      if (resp.ok) {
        statusDot.className = "ds-status-dot online";
        statusDot.title = "Backend Online";
      } else {
        statusDot.className = "ds-status-dot offline";
        statusDot.title = "Backend Unhealthy";
      }
    } catch {
      statusDot.className = "ds-status-dot offline";
      statusDot.title = "Backend Disconnected";
    }
  }

  // --------------------------------------------------------------------------
  // Active Tab Detection
  // --------------------------------------------------------------------------
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url) {
      const isStore = tab.url.includes("amazon.in") || tab.url.includes("flipkart.com");
      if (isStore) {
        activeTabBanner.style.display = "flex";
        detectedTitle.textContent = tab.title || "Active Product Page";
        urlInput.value = tab.url;

        quickScanBtn.addEventListener("click", () => {
          performAnalysis(tab.url);
        });
      }
    }
  } catch (err) {
    console.debug("[DealSense Popup] Active tab query skipped:", err);
  }

  // --------------------------------------------------------------------------
  // Product Analysis
  // --------------------------------------------------------------------------
  analyzeBtn.addEventListener("click", () => {
    const url = urlInput.value.trim();
    if (url) performAnalysis(url);
  });

  urlInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const url = urlInput.value.trim();
      if (url) performAnalysis(url);
    }
  });

  function formatINR(val) {
    if (!val || isNaN(val)) return "—";
    return "₹" + Math.round(val).toLocaleString("en-IN");
  }

  async function performAnalysis(url) {
    analyzeBtn.disabled = true;
    analyzeBtn.textContent = "...";
    placeholder.style.display = "none";
    resultContainer.style.display = "block";
    resultContainer.innerHTML = `<div style="text-align:center;padding:24px;color:#94a3b8;">Analyzing verified price history...</div>`;

    chrome.runtime.sendMessage({
      action: "ANALYZE_URL",
      payload: { url }
    }, response => {
      analyzeBtn.disabled = false;
      analyzeBtn.textContent = "Check";

      if (!response || !response.success || !response.data) {
        resultContainer.innerHTML = `
          <div style="background:#ef444422;border:1px solid #ef444466;color:#f87171;padding:12px;border-radius:8px;font-size:12px;">
            ${response?.error || "Could not analyze product. Ensure backend is running."}
          </div>
        `;
        return;
      }

      const data = response.data;
      const score = data.deal_score ?? data.score ?? 70;
      const verdict = data.verdict ?? (score >= 80 ? "BUY NOW" : score >= 50 ? "WAIT" : "AVOID");
      const badgeStyle = score >= 80 ? "background:#10b98122;color:#34d399;border:1px solid #10b98166;"
                       : score >= 50 ? "background:#f59e0b22;color:#fbbf24;border:1px solid #f59e0b66;"
                       : "background:#ef444422;color:#f87171;border:1px solid #ef444466;";

      const curPrice = data.price ?? data.current_price ?? 0;
      const mrp = data.mrp ?? 0;
      const rival = data.rival_comparison || {};
      const hasRival = rival.matched && rival.price;
      const rivalCheaper = hasRival && rival.price < curPrice;

      resultContainer.innerHTML = `
        <div class="ds-result-card">
          <div class="ds-prod-title">${data.title || data.canonical_title || "Verified Product"}</div>

          <div class="ds-score-badge-row">
            <div>
              <span class="ds-score-pill">${score}</span>
              <span style="font-size:11px;color:#94a3b8">/100 Deal Score</span>
            </div>
            <span class="ds-verdict-pill" style="${badgeStyle}">${verdict}</span>
          </div>

          <div class="ds-price-row">
            <span class="ds-cur-price">${formatINR(curPrice)}</span>
            ${mrp > curPrice ? `<span class="ds-orig-mrp">${formatINR(mrp)}</span>` : ""}
          </div>

          ${hasRival ? `
            <div class="ds-rival-box">
              <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                <span style="font-weight:600;color:#a5b4fc">${rival.merchant?.toUpperCase() || "RIVAL"} Price:</span>
                <span style="font-weight:800;color:#34d399">${formatINR(rival.price)}</span>
              </div>
              ${rivalCheaper ? `
                <div style="font-size:11px;color:#10b981;font-weight:700;">Save ${formatINR(curPrice - rival.price)} on ${rival.merchant}!</div>
              ` : `
                <div style="font-size:11px;color:#94a3b8">Current store has the lowest verified price.</div>
              `}
            </div>
          ` : ""}

          <div style="display:flex;gap:8px;font-size:11px;color:#94a3b8;border-top:1px solid rgba(255,255,255,0.06);padding-top:8px;">
            <span>Lowest: <strong>${formatINR(data.lowest_price || curPrice)}</strong></span>
            <span>•</span>
            <span>Avg: <strong>${formatINR(data.average_price || curPrice)}</strong></span>
          </div>
        </div>
      `;
    });
  }

  // --------------------------------------------------------------------------
  // Watchlist Management
  // --------------------------------------------------------------------------
  function loadWatchlist() {
    chrome.runtime.sendMessage({ action: "GET_WATCHLIST" }, response => {
      const items = response?.watchlist || [];
      watchlistCount.textContent = `${items.length} Tracked Items`;

      if (!items.length) {
        watchlistList.innerHTML = `<div class="ds-empty-state">No active price alerts yet. Set alerts on Amazon & Flipkart!</div>`;
        return;
      }

      watchlistList.innerHTML = items.map(item => `
        <div class="ds-watchlist-item">
          <div class="ds-watch-title" title="${item.product_title}">${item.product_title}</div>
          <div class="ds-watch-meta">
            <span>Target: <strong style="color:#34d399">${formatINR(item.target_price)}</strong></span>
            <span>Via ${item.channel?.toUpperCase() || "BOT"}</span>
          </div>
        </div>
      `).join("");
    });
  }

  clearWatchlistBtn.addEventListener("click", async () => {
    await chrome.storage.local.set({ dealsense_watchlist: [] });
    loadWatchlist();
  });

  // --------------------------------------------------------------------------
  // Settings Management
  // --------------------------------------------------------------------------
  function loadSettings() {
    chrome.runtime.sendMessage({ action: "GET_SETTINGS" }, response => {
      if (response && response.settings) {
        currentSettings = response.settings;
        apiBaseInput.value = currentSettings.apiBase || "http://localhost:8000";
        channelSelect.value = currentSettings.preferredChannel || "telegram";
        contactInput.value = currentSettings.contactInfo || "";
        checkHealth(apiBaseInput.value);
      }
    });
  }

  saveSettingsBtn.addEventListener("click", () => {
    const updated = {
      apiBase: apiBaseInput.value.trim() || "http://localhost:8000",
      preferredChannel: channelSelect.value,
      contactInfo: contactInput.value.trim()
    };

    chrome.runtime.sendMessage({
      action: "SAVE_SETTINGS",
      payload: updated
    }, resp => {
      settingsStatus.style.display = "block";
      if (resp && resp.success) {
        settingsStatus.style.background = "#10b98122";
        settingsStatus.style.color = "#34d399";
        settingsStatus.textContent = "Settings saved successfully!";
        checkHealth(updated.apiBase);
        setTimeout(() => { settingsStatus.style.display = "none"; }, 2500);
      } else {
        settingsStatus.style.background = "#ef444422";
        settingsStatus.style.color = "#f87171";
        settingsStatus.textContent = resp?.error || "Failed to save settings.";
      }
    });
  });

  // Initial load
  loadSettings();
});
