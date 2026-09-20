/**
 * DealSense Extension Background Service Worker (Manifest V3)
 * Handles cross-origin network queries to DealSense backend,
 * local caching (TTL 10m), badge telemetry, and alert forwarding.
 */

const DEFAULT_SETTINGS = {
  apiBase: "http://localhost:8000",
  autoInjectPill: true,
  preferredChannel: "telegram",
  contactInfo: "",
  cacheTtlMs: 10 * 60 * 1000 // 10 minutes
};

// In-memory cache for fast lookups
const memoryCache = new Map();

/**
 * Retrieves effective configuration merged with user overrides.
 */
async function getEffectiveSettings() {
  try {
    const stored = await chrome.storage.local.get("dealsense_settings");
    return { ...DEFAULT_SETTINGS, ...(stored.dealsense_settings || {}) };
  } catch (err) {
    console.warn("[DealSense SW] Failed to read storage, using defaults:", err);
    return DEFAULT_SETTINGS;
  }
}

/**
 * Initializes settings on installation
 */
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log("[DealSense SW] Extension installed/updated:", details.reason);
  const current = await chrome.storage.local.get("dealsense_settings");
  if (!current.dealsense_settings) {
    await chrome.storage.local.set({ dealsense_settings: DEFAULT_SETTINGS });
  }
});

/**
 * Handles incoming messages from content scripts and action popup.
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const { action, payload } = request || {};

  if (action === "ANALYZE_URL") {
    handleAnalyzeUrl(payload, sender)
      .then(res => sendResponse({ success: true, data: res }))
      .catch(err => sendResponse({ success: false, error: err.message || "Failed to analyze URL" }));
    return true; // Asynchronous response indicator
  }

  if (action === "CREATE_ALERT") {
    handleCreateAlert(payload)
      .then(res => sendResponse({ success: true, data: res }))
      .catch(err => sendResponse({ success: false, error: err.message || "Failed to create alert" }));
    return true;
  }

  if (action === "CREATE_TELEGRAM_BIND") {
    handleTelegramBind(payload)
      .then(res => sendResponse({ success: true, data: res }))
      .catch(err => sendResponse({ success: false, error: err.message || "Failed to create telegram bind" }));
    return true;
  }

  if (action === "GET_SETTINGS") {
    getEffectiveSettings().then(settings => sendResponse({ success: true, settings }));
    return true;
  }

  if (action === "SAVE_SETTINGS") {
    chrome.storage.local.set({ dealsense_settings: payload })
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (action === "GET_WATCHLIST") {
    chrome.storage.local.get("dealsense_watchlist")
      .then(stored => sendResponse({ success: true, watchlist: stored.dealsense_watchlist || [] }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

/**
 * Analyzes product URL using DealSense Backend /api/check-deal or /api/analyze.
 */
async function handleAnalyzeUrl(payload, sender) {
  const { url, forceRefresh } = payload || {};
  if (!url) throw new Error("Missing product URL");

  const settings = await getEffectiveSettings();
  const cacheKey = `deal_${url}`;
  const now = Date.now();

  // Check in-memory cache unless forceRefresh
  if (!forceRefresh && memoryCache.has(cacheKey)) {
    const cached = memoryCache.get(cacheKey);
    if (now - cached.timestamp < settings.cacheTtlMs) {
      return cached.data;
    }
  }

  const endpoint = `${settings.apiBase.replace(/\/$/, "")}/api/check-deal?url=${encodeURIComponent(url)}${forceRefresh ? "&force_refresh=true" : ""}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "X-DealSense-Client": "Chrome-Extension-MV3"
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`DealSense server error (${response.status}): ${errText}`);
    }

    const data = await response.json();

    // Cache successful response
    memoryCache.set(cacheKey, { timestamp: now, data });

    // Update extension badge if sender has tab
    if (sender && sender.tab && sender.tab.id) {
      updateBadgeForTab(sender.tab.id, data);
    }

    return data;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") {
      throw new Error("DealSense backend connection timed out (8s)");
    }
    throw err;
  }
}

/**
 * Updates action badge text and color based on deal intelligence.
 */
function updateBadgeForTab(tabId, data) {
  try {
    const score = data.deal_score ?? data.score ?? null;
    const rivalCheaper = data.rival_comparison?.rival_is_cheaper || data.verdict === "BUY_RIVAL";

    if (rivalCheaper) {
      chrome.action.setBadgeText({ tabId, text: "SAVE" });
      chrome.action.setBadgeBackgroundColor({ tabId, color: "#10B981" }); // Emerald
    } else if (score !== null && score !== undefined) {
      chrome.action.setBadgeText({ tabId, text: String(score) });
      const color = score >= 80 ? "#10B981" : score >= 50 ? "#F59E0B" : "#EF4444";
      chrome.action.setBadgeBackgroundColor({ tabId, color });
    } else {
      chrome.action.setBadgeText({ tabId, text: "" });
    }
  } catch (err) {
    console.debug("[DealSense SW] Could not set badge:", err);
  }
}

/**
 * Registers price drop alert on DealSense backend.
 */
async function handleCreateAlert(payload) {
  const settings = await getEffectiveSettings();
  const endpoint = `${settings.apiBase.replace(/\/$/, "")}/api/alerts`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "X-DealSense-Client": "Chrome-Extension-MV3"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Failed to create alert (${response.status}): ${errText}`);
  }

  const result = await response.json();

  // Save to local watchlist
  try {
    const stored = await chrome.storage.local.get("dealsense_watchlist");
    const watchlist = stored.dealsense_watchlist || [];
    watchlist.unshift({
      alert_id: result.alert_id,
      product_title: payload.product_title,
      current_price: payload.current_price,
      target_price: payload.target_price,
      channel: payload.channel,
      created_at: new Date().toISOString()
    });
    await chrome.storage.local.set({ dealsense_watchlist: watchlist.slice(0, 30) });
  } catch (saveErr) {
    console.warn("[DealSense SW] Failed to append watchlist:", saveErr);
  }

  return result;
}

/**
 * Generates 1-click Telegram binding deep-link.
 */
async function handleTelegramBind(payload) {
  const settings = await getEffectiveSettings();
  const endpoint = `${settings.apiBase.replace(/\/$/, "")}/api/alerts/telegram/bind-request`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "X-DealSense-Client": "Chrome-Extension-MV3"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Telegram bind error (${response.status}): ${errText}`);
  }

  return await response.json();
}
