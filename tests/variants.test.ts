import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildOptions,
  parseVariant,
  variantMatches,
} from "../src/lib/db/variants";

/* ------------------------------ variant parsing ------------------------------ */

test("parses a store variant string into its parts", () => {
  const parts = parseVariant("Colour: Black Velvet · Size: 16GB+512GB");
  assert.equal(parts.colour, "Black Velvet");
  assert.equal(parts.size, "16GB+512GB");
});

test("keeps every dimension a store publishes", () => {
  const parts = parseVariant(
    "Size: 12GB + 512GB · Style Name: With exchange bonus · Colour: Titanium Black",
  );
  assert.equal(parts.size, "12GB + 512GB");
  assert.equal(parts.styleName, "With exchange bonus");
  assert.equal(parts.colour, "Titanium Black");
});

test("ignores a variant string with no key", () => {
  assert.deepEqual(parseVariant("just some words"), {});
  assert.deepEqual(parseVariant(""), {});
});

/* -------------------------------- the options -------------------------------- */

const ROWS = [
  { variant: "Colour: Black · Size: 5 UK" },
  { variant: "Colour: Black · Size: 6 UK" },
  { variant: "Colour: White · Size: 5 UK" },
  { variant: null },
];

test("builds one dimension per option the product comes in", () => {
  const opts = buildOptions(ROWS);
  assert.equal(opts.dimensions.length, 2);
  assert.equal(opts.dimensions[0].key, "colour");
  assert.equal(opts.dimensions[1].key, "size");
  assert.equal(opts.variants.length, 3);
  assert.equal(opts.total, 4);
  assert.equal(opts.tagged, 3);
});

test("counts how many reviews each option value carries", () => {
  const opts = buildOptions(ROWS);
  const colour = opts.dimensions.find((d) => d.key === "colour")!;
  const black = colour.values.find((v) => v.value === "Black")!;
  assert.equal(black.count, 2);

  const size = opts.dimensions.find((d) => d.key === "size")!;
  const five = size.values.find((v) => v.value === "5 UK")!;
  assert.equal(five.count, 2);
});

test("colour comes before size, whatever the store wrote first", () => {
  const opts = buildOptions([
    { variant: "Size: 9 UK · Colour: PINK" },
    { variant: "Colour: PINK · Size: 9 UK" },
  ]);
  assert.equal(opts.dimensions[0].key, "colour");
  assert.equal(opts.dimensions[1].key, "size");
});

test("a product with no variant data has no options", () => {
  const opts = buildOptions([{ variant: null }, { variant: "" }]);
  assert.equal(opts.dimensions.length, 0);
  assert.equal(opts.variants.length, 0);
});

/* --------------------------------- filtering --------------------------------- */

test("an option filter keeps only the reviews of that option", () => {
  assert.equal(variantMatches("Colour: Black · Size: 5 UK", { key: "colour", value: "Black" }), true);
  assert.equal(variantMatches("Colour: White · Size: 5 UK", { key: "colour", value: "Black" }), false);
  assert.equal(variantMatches("Colour: Black · Size: 5 UK", { key: "size", value: "5 UK" }), true);
});

test("a review with no variant never matches a filter", () => {
  assert.equal(variantMatches(null, { key: "colour", value: "Black" }), false);
  assert.equal(variantMatches("Colour: Black", null), true);
});
