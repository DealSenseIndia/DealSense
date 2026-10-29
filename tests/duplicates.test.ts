import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@libsql/client";

import { canonicalListingWhere } from "../src/lib/db/canonical";
import { DUPLICATE_PARK_MS, duplicateParkPatch } from "../src/lib/engine/duplicates";

const DDL = `CREATE TABLE listings (
  id TEXT PRIMARY KEY,
  merchant TEXT NOT NULL,
  merchant_product_id TEXT NOT NULL,
  last_checked_at INTEGER,
  next_check_at INTEGER
)`;

type Row = {
  id: string;
  merchant: string;
  mpid: string;
  checkedAt: number | null;
};

async function canonicalIds(rows: Row[]): Promise<string[]> {
  const client = createClient({ url: "file::memory:" });
  try {
    await client.execute(DDL);
    for (const row of rows) {
      await client.execute({
        sql: `INSERT INTO listings (id, merchant, merchant_product_id, last_checked_at, next_check_at)
              VALUES (?, ?, ?, ?, NULL)`,
        args: [row.id, row.merchant, row.mpid, row.checkedAt],
      });
    }
    const res = await client.execute(
      `SELECT id FROM listings WHERE ${canonicalListingWhere("listings", "twin")} ORDER BY id`,
    );
    return res.rows.map((r) => String(r.id));
  } finally {
    client.close();
  }
}

test("the canonical predicate keeps the twin with the latest successful check", async () => {
  assert.deepEqual(
    await canonicalIds([
      { id: "a", merchant: "flipkart", mpid: "ITMABC", checkedAt: 100 },
      { id: "b", merchant: "flipkart", mpid: "itmabc", checkedAt: 200 },
    ]),
    ["b"],
  );
});

test("a never-checked twin loses to a checked one", async () => {
  assert.deepEqual(
    await canonicalIds([
      { id: "a", merchant: "flipkart", mpid: "ITMABC", checkedAt: null },
      { id: "b", merchant: "flipkart", mpid: "itmabc", checkedAt: 100 },
    ]),
    ["b"],
  );
});

test("a tie is broken by the lower id", async () => {
  assert.deepEqual(
    await canonicalIds([
      { id: "a", merchant: "flipkart", mpid: "ITMABC", checkedAt: null },
      { id: "b", merchant: "flipkart", mpid: "itmabc", checkedAt: null },
    ]),
    ["a"],
  );
});

test("the same id at another merchant is not a twin", async () => {
  assert.deepEqual(
    await canonicalIds([
      { id: "a", merchant: "amazon", mpid: "ITMABC", checkedAt: null },
      { id: "b", merchant: "flipkart", mpid: "itmabc", checkedAt: null },
    ]),
    ["a", "b"],
  );
});

/* ----------------------------- parking patch ----------------------------- */

const NOW = 1_800_000_000_000;

test("a different resolved listing parks the queued row", () => {
  const patch = duplicateParkPatch("queued", "canonical", NOW);
  assert.ok(patch);
  assert.equal(patch.nextCheckAt, NOW + DUPLICATE_PARK_MS);
  assert.equal(patch.failureCount, 0);
  assert.match(patch.lastError, /canonical/);
});

test("a matching or missing resolved listing is not parked", () => {
  assert.equal(duplicateParkPatch("same", "same", NOW), null);
  assert.equal(duplicateParkPatch("same", null, NOW), null);
  assert.equal(duplicateParkPatch("same", undefined, NOW), null);
});
