/**
 * Search the PriceHistory.ai catalogue for products worth adding to a setup
 * blueprint gap. Read-only: nothing is imported here.
 *
 *   npx tsx scripts/setups-find.ts "gaming monitor 144hz"
 *   npx tsx scripts/setups-find.ts "coffee table" --max 5000
 */
import "./env";
import { searchPriceHistoryAi } from "../src/lib/engine/providers/pricehistoryAi";

async function main() {
  const args = process.argv.slice(2);
  const dash = args.findIndex((a) => a.startsWith("--"));
  const queryParts = dash === -1 ? args : args.slice(0, dash);
  const query = queryParts.join(" ");
  const maxIdx = args.indexOf("--max");
  const max = maxIdx !== -1 ? Number(args[maxIdx + 1]) || Infinity : Infinity;
  const minIdx = args.indexOf("--min");
  const min = minIdx !== -1 ? Number(args[minIdx + 1]) || 0 : 0;

  const hits = await searchPriceHistoryAi(query, 50);
  console.log(`"${query}" → ${hits.length} provider results`);
  for (const h of hits) {
    const price = h.current_price ?? 0;
    if (price < min || price > max) continue;
    console.log(
      `  ${String(h.id).padEnd(7)} ${h.platform.padEnd(9)} ₹${String(Math.round(price)).padStart(7)}  ${h.in_stock === false ? "OOS  " : "     "}${h.title.slice(0, 100)}`,
    );
  }
}

main().then(() => process.exit(0));
