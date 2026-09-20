/**
 * DealSense Content Script (Manifest V3)
 * Injects non-intrusive floating price comparison badge and one-click deal alert modal
 * into Amazon.in and Flipkart product detail pages via encapsulated Shadow DOM.
 */

(function () {
  "use strict";

  // Prevent double injection
  if (window.__DEALSENSE_INJECTED__) return;
  window.__DEALSENSE_INJECTED__ = true;

  let shadowRoot = null;
  let dockElement = null;
  let currentProductData = null;
  let isCardExpanded = true;

  /**
   * Identifies if current page is a supported product detail page.
   */
  function isProductPage() {
    const host = window.location.hostname;
    const path = window.location.pathname;
    const search = window.location.search;

    if (host.includes("amazon.in")) {
      return path.includes("/dp/") || path.includes("/gp/product/");
    }
    if (host.includes("flipkart.com")) {
      return path.includes("/p/") || search.includes("pid=");
    }
    return false;
  }

  /**
   * Initializes encapsulated Shadow DOM host.
   */
  function initShadowHost() {
    if (shadowRoot) return shadowRoot;

    let host = document.getElementById("dealsense-host");
    if (!host) {
      host = document.createElement("div");
      host.id = "dealsense-host";
      document.body.appendChild(host);
    }

    shadowRoot = host.attachShadow({ mode: "open" });

    // Link scoped stylesheet
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = chrome.runtime.getURL("styles.css");
    shadowRoot.appendChild(link);

    // Create main dock
    dockElement = document.createElement("div");
    dockElement.className = "dealsense-dock";
    shadowRoot.appendChild(dockElement);

    return shadowRoot;
  }

  /**
   * Extracts visible price from host page DOM as fallback.
   */
  function extractPagePrice() {
    const host = window.location.hostname;
    let priceText = "";

    if (host.includes("amazon.in")) {
      const el = document.querySelector(".a-price .a-offscreen") ||
                 document.querySelector("#priceblock_ourprice") ||
                 document.querySelector("#priceblock_dealprice") ||
                 document.querySelector(".a-price-whole");
      if (el) priceText = el.textContent || "";
    } else if (host.includes("flipkart.com")) {
      const el = document.querySelector("div[class*='_30jeq3']") ||
                 document.querySelector("div[class*='Nx9bqj']");
      if (el) priceText = el.textContent || "";
    }

    const cleanNum = priceText.replace(/[^\d.]/g, "");
    return cleanNum ? parseFloat(cleanNum) : 0;
  }

  /**
   * Renders the loading floating bubble.
   */
  function renderLoading() {
    initShadowHost();
    dockElement.innerHTML = `
      <div class="dealsense-bubble" id="ds-bubble">
        <div class="dealsense-bubble-logo">⚡</div>
        <span class="dealsense-bubble-text">DealSense Checking...</span>
      </div>
    `;
  }

  /**
   * Formats Indian Rupee currency.
   */
  function formatINR(val) {
    if (val === null || val === undefined || isNaN(val)) return "—";
    return "₹" + Math.round(val).toLocaleString("en-IN");
  }

  /**
   * Renders the full floating comparison card and trigger bubble.
   */
  function renderCard(data) {
    initShadowHost();
    currentProductData = data;

    const decision = data.decision || {};
    const pricing = data.pricing || {};
    const score = data.deal_score ?? decision.score ?? data.score ?? 75;
    const verdict = data.verdict ?? decision.verdict ?? (score >= 80 ? "BUY NOW" : score >= 50 ? "WAIT" : "AVOID");
    const badgeClass = score >= 80 ? "badge-buy" : score >= 50 ? "badge-wait" : "badge-avoid";

    const currentPrice = data.current_price ?? pricing.current_price ?? data.price ?? extractPagePrice();
    const lowestPrice = data.lowest_price ?? decision.historical_low ?? data.history_summary?.lowest_price ?? null;
    const lowestDate = data.lowest_date ?? data.history_summary?.lowest_date ?? null;
    const avgPrice = data.average_price ?? decision.historical_avg_90d ?? data.history_summary?.average_price ?? null;

    // Rival store details
    const rival = data.rival_comparison || {};
    const hasRival = rival.matched && rival.price;
    const rivalStore = rival.merchant ? (rival.merchant.charAt(0).toUpperCase() + rival.merchant.slice(1)) : "Rival";
    const rivalPrice = rival.price;
    const rivalSavings = rival.savings || (currentPrice && rivalPrice && currentPrice > rivalPrice ? currentPrice - rivalPrice : 0);
    const rivalUrl = rival.affiliate_url || rival.outbound_url || rival.url || "#";

    const bestBank = data.best_bank_offer || (data.bank_offers && data.bank_offers[0]) || null;

    dockElement.innerHTML = `
      ${isCardExpanded ? `
      <div class="dealsense-card" id="ds-card">
        <div class="dealsense-header">
          <div class="dealsense-brand">
            <div class="dealsense-bubble-logo">⚡</div>
            <span class="dealsense-title">DealSense Intelligence</span>
          </div>
          <button class="dealsense-close-btn" id="ds-collapse-btn" title="Minimize">−</button>
        </div>

        <div class="dealsense-body">
          <div class="dealsense-score-row">
            <div>
              <div class="dealsense-score-num">${score}<span style="font-size:14px;color:#94a3b8">/100</span></div>
              <div class="dealsense-score-label">Deal Score</div>
            </div>
            <div class="dealsense-verdict-tag ${badgeClass}">${verdict}</div>
          </div>

          ${hasRival && rivalPrice < currentPrice ? `
          <div class="dealsense-rival-banner">
            <div class="dealsense-rival-header">
              <span class="dealsense-rival-name">Cheaper on ${rivalStore}!</span>
              <span class="dealsense-rival-price">${formatINR(rivalPrice)}</span>
            </div>
            <div class="dealsense-savings-badge">Save ${formatINR(rivalSavings)} on ${rivalStore}</div>
            ${bestBank ? `<div class="dealsense-bank-offer">💳 Extra ₹${bestBank.discount || bestBank.value} off with ${bestBank.bank || 'Bank'} Card</div>` : ''}
            <a href="${rivalUrl}" target="_blank" rel="noopener noreferrer" class="dealsense-btn-rival">
              View on ${rivalStore} ↗
            </a>
          </div>
          ` : hasRival ? `
          <div class="dealsense-rival-banner">
            <div class="dealsense-rival-header">
              <span class="dealsense-rival-name">${rivalStore} Price:</span>
              <span class="dealsense-rival-price">${formatINR(rivalPrice)}</span>
            </div>
            <div style="font-size:11px;color:#94a3b8">Current store has the lowest price right now.</div>
          </div>
          ` : ''}

          <div class="dealsense-stats-grid">
            <div class="dealsense-stat-tile">
              <div class="dealsense-stat-label">Lowest Price</div>
              <div class="dealsense-stat-val">${formatINR(lowestPrice || currentPrice)}</div>
              ${lowestDate ? `<div style="font-size:9px;color:#64748b">${lowestDate}</div>` : ''}
            </div>
            <div class="dealsense-stat-tile">
              <div class="dealsense-stat-label">Average Price</div>
              <div class="dealsense-stat-val">${formatINR(avgPrice || currentPrice)}</div>
            </div>
          </div>

          <div class="dealsense-actions">
            <button class="dealsense-btn-alert" id="ds-open-alert-btn">
              🔔 Set Price Alert
            </button>
          </div>
        </div>
      </div>
      ` : ''}

      <div class="dealsense-bubble" id="ds-bubble">
        <div class="dealsense-bubble-logo">⚡</div>
        <span class="dealsense-bubble-text">${score} • ${verdict}</span>
        ${hasRival && rivalPrice < currentPrice ? `<span class="dealsense-bubble-badge badge-buy">Save ${formatINR(rivalSavings)}</span>` : ''}
      </div>
    `;

    // Attach click listeners
    const bubble = shadowRoot.getElementById("ds-bubble");
    if (bubble) {
      bubble.onclick = () => {
        isCardExpanded = !isCardExpanded;
        renderCard(currentProductData);
      };
    }

    const collapseBtn = shadowRoot.getElementById("ds-collapse-btn");
    if (collapseBtn) {
      collapseBtn.onclick = (e) => {
        e.stopPropagation();
        isCardExpanded = false;
        renderCard(currentProductData);
      };
    }

    const alertBtn = shadowRoot.getElementById("ds-open-alert-btn");
    if (alertBtn) {
      alertBtn.onclick = () => openAlertModal(currentProductData);
    }
  }

  /**
   * Opens the in-page price alert modal inside Shadow DOM.
   */
  function openAlertModal(data) {
    const curPrice = data.price ?? data.current_price ?? extractPagePrice();
    const defaultTarget = Math.round(curPrice * 0.95); // 5% below

    const modal = document.createElement("div");
    modal.className = "dealsense-modal-backdrop";
    modal.id = "ds-alert-modal";
    modal.innerHTML = `
      <div class="dealsense-modal-content">
        <div class="dealsense-modal-header">
          <span class="dealsense-modal-title">🔔 Set Price Drop Alert</span>
          <button class="dealsense-close-btn" id="ds-modal-close">✕</button>
        </div>
        <div class="dealsense-modal-body">
          <div style="font-size:12px;color:#94a3b8;line-height:1.4">
            We will notify you immediately when verified price drops below your target.
          </div>

          <div class="dealsense-input-group">
            <label class="dealsense-input-label">Target Price (₹)</label>
            <input type="number" id="ds-target-price-input" class="dealsense-input" value="${defaultTarget}" min="1">
          </div>

          <div class="dealsense-presets">
            <button class="dealsense-preset-btn" data-pct="0.95">-5% (₹${Math.round(curPrice * 0.95).toLocaleString('en-IN')})</button>
            <button class="dealsense-preset-btn" data-pct="0.90">-10% (₹${Math.round(curPrice * 0.90).toLocaleString('en-IN')})</button>
            <button class="dealsense-preset-btn" data-target="${data.lowest_price || Math.round(curPrice * 0.85)}">All-Time Low</button>
          </div>

          <div class="dealsense-input-group">
            <label class="dealsense-input-label">Notification Channel</label>
            <select id="ds-channel-select" class="dealsense-input" style="min-height:44px;">
              <option value="telegram">Telegram (Instant Bot Ping)</option>
              <option value="whatsapp">WhatsApp</option>
            </select>
          </div>

          <div class="dealsense-input-group" id="ds-contact-group" style="display:none;">
            <label class="dealsense-input-label">WhatsApp Number (+91...)</label>
            <input type="text" id="ds-contact-input" class="dealsense-input" placeholder="+919876543210">
          </div>

          <button class="dealsense-btn-primary" id="ds-submit-alert-btn">
            Confirm & Activate Alert
          </button>
          <div id="ds-modal-feedback" style="display:none;font-size:12px;text-align:center;padding:8px;border-radius:6px;"></div>
        </div>
      </div>
    `;

    shadowRoot.appendChild(modal);

    // Modal Events
    const closeModal = () => modal.remove();
    shadowRoot.getElementById("ds-modal-close").onclick = closeModal;
    modal.onclick = (e) => { if (e.target === modal) closeModal(); };

    const priceInput = shadowRoot.getElementById("ds-target-price-input");
    const channelSelect = shadowRoot.getElementById("ds-channel-select");
    const contactGroup = shadowRoot.getElementById("ds-contact-group");
    const contactInput = shadowRoot.getElementById("ds-contact-input");
    const submitBtn = shadowRoot.getElementById("ds-submit-alert-btn");
    const feedback = shadowRoot.getElementById("ds-modal-feedback");

    channelSelect.onchange = () => {
      contactGroup.style.display = channelSelect.value === "whatsapp" ? "flex" : "none";
    };

    // Preset buttons
    modal.querySelectorAll(".dealsense-preset-btn").forEach(btn => {
      btn.onclick = () => {
        if (btn.dataset.pct) {
          priceInput.value = Math.round(curPrice * parseFloat(btn.dataset.pct));
        } else if (btn.dataset.target) {
          priceInput.value = Math.round(parseFloat(btn.dataset.target));
        }
      };
    });

    submitBtn.onclick = async () => {
      const targetPrice = parseFloat(priceInput.value);
      const channel = channelSelect.value;
      const contact = contactInput.value.trim();

      if (!targetPrice || targetPrice <= 0) {
        feedback.style.display = "block";
        feedback.style.color = "#f87171";
        feedback.textContent = "Please enter a valid target price.";
        return;
      }

      if (channel === "whatsapp" && !contact) {
        feedback.style.display = "block";
        feedback.style.color = "#f87171";
        feedback.textContent = "Please provide your WhatsApp number.";
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = "Activating Alert...";

      if (channel === "telegram") {
        // Trigger 1-click Telegram bind request
        chrome.runtime.sendMessage({
          action: "CREATE_TELEGRAM_BIND",
          payload: {
            product_title: data.title || document.title,
            current_price: curPrice,
            target_price: targetPrice,
            alert_type: "TARGET_PRICE"
          }
        }, resp => {
          submitBtn.disabled = false;
          if (resp && resp.success && resp.data && resp.data.deep_link) {
            feedback.style.display = "block";
            feedback.style.color = "#34d399";
            feedback.innerHTML = `
              🎉 Alert Created! <br>
              <a href="${resp.data.deep_link}" target="_blank" style="color:#6366f1;font-weight:700;text-decoration:underline;">
                Click here to start DealSense Telegram Bot ↗
              </a>
            `;
          } else {
            feedback.style.display = "block";
            feedback.style.color = "#34d399";
            feedback.textContent = "🎉 Price Alert successfully armed!";
            setTimeout(closeModal, 2000);
          }
        });
      } else {
        // Standard alert
        chrome.runtime.sendMessage({
          action: "CREATE_ALERT",
          payload: {
            product_title: data.title || document.title,
            current_price: curPrice,
            target_price: targetPrice,
            channel: channel,
            contact: contact || "user",
            alert_type: "TARGET_PRICE"
          }
        }, resp => {
          submitBtn.disabled = false;
          if (resp && resp.success) {
            feedback.style.display = "block";
            feedback.style.color = "#34d399";
            feedback.textContent = "🎉 WhatsApp Alert successfully armed!";
            setTimeout(closeModal, 2000);
          } else {
            feedback.style.display = "block";
            feedback.style.color = "#f87171";
            feedback.textContent = resp.error || "Failed to create alert.";
          }
        });
      }
    };
  }

  /**
   * Main orchestrator: extracts product info and queries background worker.
   */
  function executeAnalysis() {
    if (!isProductPage()) return;

    renderLoading();

    chrome.runtime.sendMessage({
      action: "ANALYZE_URL",
      payload: { url: window.location.href }
    }, response => {
      if (response && response.success && response.data) {
        renderCard(response.data);
      } else {
        // Fallback card with basic DOM info
        renderCard({
          title: document.title,
          current_price: extractPagePrice(),
          deal_score: 70,
          verdict: "MONITORED"
        });
      }
    });
  }

  // Initial execution when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", executeAnalysis);
  } else {
    executeAnalysis();
  }

  // Handle client-side SPAs (e.g. Flipkart browsing without full page reload)
  let lastUrl = window.location.href;
  new MutationObserver(() => {
    const url = window.location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      executeAnalysis();
    }
  }).observe(document, { subtree: true, childList: true });

})();
