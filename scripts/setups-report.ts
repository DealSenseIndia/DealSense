/**
 * Read-only health report for the Smart Setups catalogue.
 *
 *   npm run setups:report
 *   npm run setups:report -- --all
 *
 * Prints slot coverage and the default-tier result for every space so a
 * blueprint change can be checked against the real catalogue before shipping.
 * Pass --all to compare all three tiers (prices must rise with the tier).
 */
import "./env";
import { buildSetup, getSetupCoverage } from "../src/lib/setups/engine";
import { SETUP_SPACES } from "../src/lib/setups/blueprints";

async function main() {
  const showAll = process.argv.includes("--all");
  const coverage = await getSetupCoverage();
  console.log(`\nCatalogue: ${coverage.candidates} supported listings with a price\n`);

  for (const space of coverage.spaces) {
    console.log(
      `${space.title.padEnd(24)} ${space.slotsReady}/${space.slotsTotal} slots (${space.coveragePct}%), ` +
        `${space.slotsWithGoodDeal} with a non-Avoid price`,
    );
    for (const slot of space.slots) {
      const flag = slot.matchingProducts > 0 ? "ok " : "GAP";
      const priced =
        slot.matchingProducts > 0 && slot.buyableProducts === 0 ? " · all Avoid" : "";
      console.log(
        `  ${flag} ${slot.label.padEnd(22)} ${slot.matchingProducts} matching, ${slot.buyableProducts} buyable${priced}`,
      );
    }
  }

  for (const space of Object.values(SETUP_SPACES)) {
    const result = await buildSetup({
      space: space.key,
      budget: space.budgetDefault,
      style: "no_preference",
    });
    const tier = result.tiers.find((t) => t.key === "value")!;
    if (showAll) {
      for (const t of result.tiers) {
        console.log(
          `\n${space.title} @ ₹${space.budgetDefault.toLocaleString("en-IN")} · ${t.label} — ` +
            `${t.items.length}/${t.completeness.slotsTotal} filled, total ₹${t.totalPrice.toLocaleString("en-IN")}, score ${t.setupScore}`,
        );
        for (const u of t.unfilled) {
          console.log(`  ✗ ${u.slotLabel.padEnd(20)} ${u.reason} — ${u.detail}`);
        }
      }
      continue;
    }
    console.log(
      `\n${space.title} @ ₹${space.budgetDefault.toLocaleString("en-IN")} — ` +
        `${tier.items.length}/${tier.completeness.slotsTotal} filled, total ₹${tier.totalPrice.toLocaleString("en-IN")}, score ${tier.setupScore}`,
    );
    for (const item of tier.items) {
      console.log(
        `  ${item.priceCaution ? "⚠" : "✓"} ${item.slotLabel.padEnd(20)} ₹${String(Math.round(item.price)).padStart(7)}  ${item.merchant.padEnd(8)} ${item.title.slice(0, 64)}`,
      );
    }
    for (const u of tier.unfilled) {
      console.log(`  ✗ ${u.slotLabel.padEnd(20)} ${u.reason} — ${u.detail}`);
    }
  }
}

main().then(() => process.exit(0));
