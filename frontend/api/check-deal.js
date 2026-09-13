// ==========================================================================
// VERCEL SERVERLESS FUNCTION: /api/check-deal
// Proxies directly to the canonical FastAPI DealSense backend.
// Zero parallel synthetic data generation permitted.
//
// This file is a duplicate of /api/check-deal.js at the repository root.
// Both exist because the Vercel project root is not pinned by a vercel.json,
// so either `api/` or `frontend/api/` may be the deployed functions
// directory. They are kept byte-for-byte identical in behaviour so the
// deployment cannot silently pick up a different implementation.
//
// This copy previously contained a full synthetic intelligence generator: on
// any scrape failure it invented a price (Rs 2,999), an MRP (price * 1.35),
// an Unsplash stock photo, a deal score of 85, a BUY verdict, a named seller
// ("RetailEZ / Appario") with a trust score of 94, three bank offers, a
// "DEALSENSE300" coupon and a rival price of price * 1.04. It also fetched
// the user-supplied URL server-side even when it matched neither Amazon nor
// Flipkart, which made it an SSRF vector. Proxying removes both problems:
// this function no longer fetches anything but our own backend.
// ==========================================================================

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  let rawUrl = "";
  let forceRefresh = false;
  let compareStores = true;

  if (req.method === "POST") {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    rawUrl = body.url || "";
    forceRefresh = Boolean(body.force_refresh);
    if (body.compare_stores !== undefined) compareStores = Boolean(body.compare_stores);
  } else {
    rawUrl = req.query.url || "";
    forceRefresh = req.query.force_refresh === "true";
    if (req.query.compare_stores !== undefined) compareStores = req.query.compare_stores === "true";
  }

  if (!rawUrl || typeof rawUrl !== "string") {
    return res.status(400).json({ detail: "A valid product URL is required." });
  }

  const backendBaseUrl = process.env.BACKEND_URL || process.env.VITE_BACKEND_URL || "http://127.0.0.1:8000";

  try {
    const targetEndpoint = `${backendBaseUrl.replace(/\/+$/, "")}/api/check-deal`;
    const backendResp = await fetch(targetEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({
        url: rawUrl.trim(),
        force_refresh: forceRefresh,
        compare_stores: compareStores,
      }),
    });

    const data = await backendResp.json();
    return res.status(backendResp.status).json(data);
  } catch (err) {
    console.error("Canonical backend proxy failed:", err);
    return res.status(503).json({
      status: "error",
      detail: "The DealSense analyser is currently unreachable. Please try again shortly.",
    });
  }
}
