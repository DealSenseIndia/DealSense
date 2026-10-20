import { loadAnalysisBySlug } from "../src/lib/engine/load";

const slugs = [
  "levis-women-80s-mom-loose-tapered-fit-high-rise-heavy-fade-stretchable-18904",
  "nike-precision-7-men-s-basketball-shoes-26750",
  "allen-solly-woman-women-brand-logo-printed-t-shirt-131158",
];

async function main() {
  for (const s of slugs) {
    try {
      const r = await loadAnalysisBySlug(s);
      console.log("OK  ", s.slice(0, 52), "->", r ? "built" : "null");
    } catch (e) {
      console.log("FAIL", s.slice(0, 52));
      console.log(
        "     ",
        (e as Error).stack?.split("\n").slice(0, 5).join("\n      "),
      );
    }
  }
}

main();
