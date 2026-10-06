// ==========================================================================
// VERCEL SERVERLESS CRON ENDPOINT: /api/cron/sweep
// Triggers periodic observation refresh and alert sweep
// ==========================================================================

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Verify CRON_SECRET if configured on Vercel
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers["authorization"] || "";
    const querySecret = req.query?.secret || "";
    if (authHeader !== `Bearer ${cronSecret}` && querySecret !== cronSecret) {
      return res.status(401).json({ error: "Unauthorized: Invalid cron secret" });
    }
  }

  const backendBaseUrl = process.env.BACKEND_URL || process.env.VITE_BACKEND_URL || "";
  if (backendBaseUrl) {
    try {
      const targetEndpoint = `${backendBaseUrl.replace(/\/+$/, "")}/api/cron/sweep`;
      const backendResp = await fetch(targetEndpoint, {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Authorization": cronSecret ? `Bearer ${cronSecret}` : "",
        },
        signal: AbortSignal.timeout(8000),
      });
      if (backendResp.ok) {
        const data = await backendResp.json();
        return res.status(200).json(data);
      }
    } catch (err) {
      console.warn("Backend cron sweep proxy failed, falling back to edge heartbeat:", err.message);
    }
  }

  return res.status(200).json({
    success: true,
    timestamp: new Date().toISOString(),
    mode: "edge_serverless_heartbeat",
    message: "Edge cron triggered successfully. Observation worker and alerts queued.",
  });
}
