// ==========================================================================
// DEALSENSE API CLIENT MODULE
//
// Thin client over the backend API. There are deliberately no client-side
// fallbacks that synthesize data: every number this module returns came from
// the server, or the call fails and the caller shows an error.
//
// This file previously carried a ~450-line "client-side deal intelligence
// generator" plus a VERIFIED_SEEDS catalog, which produced deal scores,
// verdicts, evidence lines, sellers, bank offers and price history derived
// from a hash of the product URL whenever the backend was unreachable. It has
// been removed -- see the notes at each call site below.
// ==========================================================================

export async function checkDeal(url, forceRefresh = false) {
  if (!url || typeof url !== "string") {
    throw new Error("Please enter a valid product URL.");
  }

  const cleanInputUrl = url.trim();

  let lastErrorDetail = null;

  // 1. Primary backend API call (Vercel Serverless Function & local backend)
  try {
    const response = await fetch("/api/check-deal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: cleanInputUrl, force_refresh: forceRefresh }),
    });

    if (response.ok) {
      const data = await response.json();
      if (data && data.product && data.product.title) {
        return data;
      }
    } else {
      try {
        const errJson = await response.json();
        if (errJson && errJson.detail) {
          lastErrorDetail = errJson.detail;
        }
      } catch (_) {}
    }
  } catch (err) {
    console.warn("Primary /api/check-deal endpoint unavailable:", err);
  }

  // 2. Localhost fallback: if frontend is served on a different local port (5500/3000/5173)
  if (typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") && window.location.port !== "8000") {
    try {
      const localResp = await fetch("http://127.0.0.1:8000/api/check-deal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: cleanInputUrl, force_refresh: forceRefresh }),
      });
      if (localResp.ok) {
        const localData = await localResp.json();
        if (localData && localData.product && localData.product.title) {
          return localData;
        }
      } else {
        try {
          const errJson = await localResp.json();
          if (errJson && errJson.detail) {
            lastErrorDetail = errJson.detail;
          }
        } catch (_) {}
      }
    } catch (e) {}
  }

  // 3. Informative error message (either specific from backend or network guidance)
  throw new Error(
    lastErrorDetail || "Could not reach the DealSense analyser. Please check your connection and try again."
  );
}

export async function searchDeals(query, limit = 6) {
  // Returns an empty result set rather than falling back to a client-side
  // catalog. searchClientDeals() served results with prices that were never
  // observed, which is indistinguishable on screen from a real listing.
  try {
    const response = await fetch(`/api/search?q=${encodeURIComponent(query)}&limit=${limit}`);
    if (response.ok) {
      return await response.json();
    }
  } catch (err) {
    console.warn("Backend search unavailable:", err);
  }

  return { query, count: 0, results: [] };
}

export async function generateSetup(payload) {
  // Calls the real composition engine. There is deliberately NO client-side
  // fallback: a setup we invent in the browser is not a setup, and showing
  // fabricated prices is worse than showing an error.
  const response = await fetch("/api/setups/build", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      space: payload.space,
      budget: payload.budget,
      owned: payload.owned || payload.owned_items || [],
      style: payload.style,
      tiers: payload.tiers || null,
    }),
  });

  if (!response.ok) {
    let detail = `Request failed (${response.status})`;
    try {
      const body = await response.json();
      if (body && body.detail) detail = body.detail;
    } catch (_) {
      /* response had no JSON body */
    }
    throw new Error(detail);
  }

  return await response.json();
}

export async function fetchSetupTemplates() {
  const response = await fetch("/api/setups/templates");
  if (!response.ok) {
    throw new Error(`Could not load setup templates (${response.status})`);
  }
  return await response.json();
}

export async function savePriceAlert(payload) {
  const response = await fetch("/api/alerts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    // Previously this caught the failure, wrote the alert to localStorage and
    // returned {status: "success"}. A price alert has to fire from the server
    // -- a row in the browser cannot watch a price or send anything -- so the
    // user was told an alert was set that would never arrive.
    let detail = `Could not set the price alert (${response.status})`;
    try {
      const body = await response.json();
      if (body && body.detail) detail = body.detail;
    } catch (_) {
      /* response had no JSON body */
    }
    throw new Error(detail);
  }

  return await response.json();
}

export async function fetchHomepageData() {
  // Returns null when the backend is unreachable, so callers can show an
  // error instead of a page of numbers. The fallback here used to report
  // "148,920" deals scanned, "12" stores monitored (we support two) and
  // "Rs 2.4 Cr" of savings generated -- none of them measured.
  try {
    const response = await fetch("/api/homepage");
    if (response.ok) {
      return await response.json();
    }
  } catch (err) {
    console.warn("Backend homepage data unavailable:", err);
  }

  return null;
}
