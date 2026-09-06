// ==========================================================================
// DEALWISE API CLIENT MODULE
// ==========================================================================

export async function checkDeal(url, forceRefresh = false) {
  const response = await fetch("/api/check-deal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, force_refresh: forceRefresh }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || "Unable to analyze product link.");
  }

  return await response.json();
}

export async function searchDeals(query, limit = 6) {
  const response = await fetch(`/api/search?q=${encodeURIComponent(query)}&limit=${limit}`);
  if (!response.ok) {
    throw new Error("Search request failed.");
  }
  return await response.json();
}

export async function generateSetup(payload) {
  const response = await fetch("/api/setup-builder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || "Setup generation failed.");
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
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to set alert.");
  }

  return await response.json();
}

export async function fetchHomepageData() {
  const response = await fetch("/api/homepage");
  if (!response.ok) {
    throw new Error("Failed to load homepage data.");
  }
  return await response.json();
}
