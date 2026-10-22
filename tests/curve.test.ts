import { test } from "node:test";
import assert from "node:assert/strict";

import { curvePath, monotoneSegments } from "../src/lib/engine/curve";
import { familyKey, parseTitleVariant } from "../src/lib/db/variantSiblings";

/* -------------------------------- the curve -------------------------------- */

test("a curve passes through every point it is given", () => {
  const pts = [
    { x: 0, y: 100 },
    { x: 50, y: 40 },
    { x: 100, y: 80 },
  ];
  const segs = monotoneSegments(pts);
  assert.equal(segs.length, 2);
  assert.equal(segs[0].from, pts[0]);
  assert.equal(segs[0].to, pts[1]);
  assert.equal(segs[1].to, pts[2]);
});

test("a curve never invents a high or a low that is not in the data", () => {
  // A peak and a trough: the curve must not overshoot either.
  const pts = [
    { x: 0, y: 10 },
    { x: 10, y: 100 },
    { x: 20, y: 10 },
    { x: 30, y: 100 },
  ];
  const segs = monotoneSegments(pts);
  const ys = [10, 100];
  for (const s of segs) {
    assert.ok(s.from.y >= ys[0] - 0.001 && s.from.y <= ys[1] + 0.001);
    assert.ok(s.to.y >= ys[0] - 0.001 && s.to.y <= ys[1] + 0.001);
  }
});

test("a flat series stays flat", () => {
  const pts = [
    { x: 0, y: 50 },
    { x: 10, y: 50 },
    { x: 20, y: 50 },
  ];
  const segs = monotoneSegments(pts);
  for (const s of segs) {
    assert.equal(s.from.y, 50);
    assert.equal(s.to.y, 50);
  }
});

test("one point makes no curve, and a curve can be joined into one path", () => {
  assert.equal(monotoneSegments([{ x: 0, y: 1 }]).length, 0);

  const pts = [
    { x: 0, y: 1 },
    { x: 10, y: 2 },
  ];
  const segs = monotoneSegments(pts);
  const full = curvePath(segs, pts[0]);
  assert.ok(full.startsWith("M 0.0,1.0"));
  assert.ok(full.includes("C "));
  // Every piece must be drawable on its own too.
  for (const s of segs) assert.ok(s.d.startsWith("M "));
});

/* ------------------------- the variant in a title ------------------------- */

test("reads the colour and size out of a store title", () => {
  const v = parseTitleVariant("Samsung Galaxy S25 Ultra 5G (Titanium Black, 256 GB)");
  assert.equal(v.colour, "Titanium Black");
  assert.equal(v.size, "256 GB");
});

test("keeps a multi-part size together", () => {
  const v = parseTitleVariant(
    "Samsung Galaxy S25 Ultra 5G AI Smartphone (Titanium Silverblue, 12GB RAM, 256GB Storage)",
  );
  assert.equal(v.colour, "Titanium Silverblue");
  assert.equal(v.size, "12GB RAM, 256GB Storage");
});

test("a title with no brackets has no variant", () => {
  const v = parseTitleVariant("Nike Men Running Shoes");
  assert.equal(v.colour, null);
  assert.equal(v.size, null);
});

test("the family key is the words before the bracket", () => {
  assert.equal(
    familyKey("Samsung Galaxy S25 Ultra 5G (Titanium Black, 256 GB)"),
    "samsung galaxy s25 ultra",
  );
  assert.equal(
    familyKey("Samsung Galaxy S25 Ultra 5G AI Smartphone (Titanium Silverblue, 12GB RAM)"),
    "samsung galaxy s25 ultra",
  );
  assert.notEqual(familyKey("Nike Men Running Shoes"), familyKey("Nike Women Running Shoes"));
});
