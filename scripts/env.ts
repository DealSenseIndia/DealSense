/**
 * Minimal .env loader for standalone scripts (Next.js loads env automatically,
 * but `tsx scripts/*` does not). Loads .env.local then .env.
 */
import { existsSync, readFileSync } from "node:fs";

for (const file of [".env.local", ".env"]) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    const key = m[1];
    const value = m[2].replace(/^["']|["']$/g, "");
    if (value && !process.env[key]) process.env[key] = value;
  }
}
