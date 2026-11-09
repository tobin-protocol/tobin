import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { unavailableClient } from "../lib/discover/client.ts";
import type { PublicInstitution, PublicSettlement } from "../lib/discover/types.ts";
import { EMPTY_TILE, SORTS, explorerUrl, institutionView, parseSort, parseTab, settlementView, statsView } from "../lib/discover/view.ts";

// These fixtures exist only in this test. No screen ships sample rows.
const HASH = "a".repeat(64);
const base: PublicSettlement = { id: "stl_0123456789abcdef0123", asset: { code: "USD", issuer: null }, amount: "1250.5", settledAt: "2026-11-09T10:00:00Z", network: "testnet", txHash: HASH, verifiedReadBack: false, parties: null };

test("the only client reports unavailable for everything and makes no request", async () => {
  for (const r of [await unavailableClient.stats(), await unavailableClient.settlements({ sort: "newest" }), await unavailableClient.institutions({ sort: "name" }), await unavailableClient.assets({ sort: "code" })]) {
    assert.equal(r.kind, "unavailable");
  }
  const src = readFileSync(join(import.meta.dirname, "../lib/discover/client.ts"), "utf8");
  assert.ok(!/\bfetch\s*\(|XMLHttpRequest|axios/.test(src), "the unavailable client must not call anything");
});

test("with no data every stat reads No data, never 0", () => {
  for (const r of [undefined, { kind: "unavailable" as const, reason: "x" }]) assert.deepEqual(statsView(r).map((s) => s.value), ["No data", "No data", "No data", "No data"]);
  assert.deepEqual(statsView({ kind: "ok", data: { settlementsRecorded: null, institutionsOptedIn: 4, assetsInUse: null, lastSettlementAt: null } }).map((s) => s.value), ["No data", "4", "No data", "No data"]);
  assert.equal(EMPTY_TILE.body, "Public settlement data is not available yet.");
});

test("a settlement names its parties only when both opted in", () => {
  assert.equal(settlementView(base).parties, null);
  assert.ok(!JSON.stringify(settlementView(base)).includes("Alpha"));
  const named = settlementView({ ...base, parties: { payer: { institutionId: "i1", displayName: "Alpha Bank" }, payee: { institutionId: "i2", displayName: "Beta Bank" } } });
  assert.equal(named.parties, "Alpha Bank paid Beta Bank");
});

test("the verified mark exists only with a verified read-back", () => {
  assert.equal(settlementView(base).mark, null);
  assert.equal(settlementView({ ...base, verifiedReadBack: true }).mark, "Confirmed");
});

test("the explorer link carries the network and refuses a malformed hash", () => {
  assert.equal(explorerUrl("testnet", HASH), `https://stellar.expert/explorer/testnet/tx/${HASH}`);
  assert.equal(explorerUrl("public", HASH.toUpperCase()), `https://stellar.expert/explorer/public/tx/${HASH}`);
  assert.equal(explorerUrl("testnet", "not-a-hash"), null);
  assert.equal(settlementView(base).network, "Stellar Testnet");
  assert.equal(settlementView({ ...base, txHash: "zz" }).explorerHref, null);
});

test("an institution tile shows only the fields it published", () => {
  const bare: PublicInstitution = { id: "inst_0123456789abcdef", displayName: "Alpha Bank" };
  assert.deepEqual(institutionView(bare).chips, []);
  const some = institutionView({ ...bare, jurisdiction: "GB", settlementCount: 1 });
  assert.deepEqual(some.chips, ["GB", "1 settlement"]);
});

test("tabs and sorts come from the URL and fall back safely", () => {
  assert.equal(parseTab("institutions"), "institutions");
  assert.equal(parseTab("nonsense"), "settlements");
  assert.equal(parseTab(null), "settlements");
  assert.equal(parseSort("settlements", "amount-high"), "amount-high");
  assert.equal(parseSort("settlements", "name"), "newest");
  assert.equal(parseSort("assets", undefined), "code");
  for (const tab of ["settlements", "institutions", "assets"] as const) assert.ok(SORTS[tab].length >= 3);
});
