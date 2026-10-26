import { test } from "node:test";
import assert from "node:assert/strict";

import { resolveLeaf, groupForCategory } from "../src/lib/db/taxonomy";

/**
 * Category matching decides which shelf a product appears on, and the old
 * version of it compared whole letter-strings. Two real rows from the catalogue
 * show where that went: "Cups & Mugs" contains the letters u-p-s, so every mug
 * we track was served on the UPS page, and "Other" is a substring of
 * "Motherboards". Matching now goes exact → whole word → long prefix, and a
 * short leaf can only win on its own words.
 */
test("a mug is not a power supply", () => {
  assert.equal(resolveLeaf("Cups & Mugs"), "Cups & Mugs");
  assert.equal(resolveLeaf("UPS"), "UPS");
  assert.equal(resolveLeaf("Other"), null);
  assert.notEqual(resolveLeaf("Motherboards"), "Other");
});

test("an exact leaf beats a leaf that merely contains the word", () => {
  assert.equal(resolveLeaf("Fitness"), "Fitness");
  assert.equal(resolveLeaf("Conditioner"), "Conditioner");
  assert.equal(resolveLeaf("Table Lamps"), "Table Lamps");
  assert.equal(resolveLeaf("Snacks"), "Snacks");
});

test("qualified store names still find their leaf", () => {
  assert.equal(resolveLeaf("Nike Sports Shoes"), "Sports Shoes");
  assert.equal(resolveLeaf("Desk Chairs"), "Chairs");
  assert.equal(resolveLeaf("Gaming Controllers"), "Controllers");
  assert.equal(resolveLeaf("Notebook Computer Stands"), "Laptop Stands");
  assert.equal(resolveLeaf("Sofa Sets"), "Sofas");
  assert.equal(resolveLeaf("Coffee makers"), "Kitchen Appliances");
});

test("a bare store shelf is placed by what we actually sell there", () => {
  // Every product the stores filed under "Audio" is a speaker or a soundbar.
  assert.equal(resolveLeaf("Audio"), "Speakers");
  assert.equal(resolveLeaf("Hand Creams & Masks"), "Hand Creams");
});

test("placement reaches the umbrella group, unknown names reach nothing", () => {
  assert.equal(groupForCategory("Cups & Mugs")?.slug, "home-living");
  assert.equal(groupForCategory("definitely not a category"), null);
  assert.equal(resolveLeaf(null), null);
  assert.equal(resolveLeaf(""), null);
});
