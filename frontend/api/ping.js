export default function handler(req, res) {
  res.status(200).json({ status: "ok", from: "frontend/api/ping.js" });
}
