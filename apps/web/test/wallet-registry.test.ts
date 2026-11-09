import assert from "node:assert/strict";
import { test } from "node:test";
import { WALLET_REGISTRY, filterWallets, orderWallets, showSearch, type WalletEntry } from "../lib/wallet/registry.ts";

const mk = (id: string, name: string, supported = true): WalletEntry => ({ id, name, installUrl: `https://example.test/${id}`, supported, desktopExtension: true });

test("today only Freighter is registered, and it is supported", () => {
  assert.deepEqual(WALLET_REGISTRY.map((w) => [w.id, w.supported]), [["freighter", true]]);
});

test("installed wallets come first, then registry order; labels follow the detection", () => {
  const entries = [mk("a", "Alpha"), mk("b", "Beta"), mk("c", "Gamma")];
  const rows = orderWallets(entries, { a: false, b: true, c: false }, "c");
  assert.deepEqual(rows.map((r) => r.entry.id), ["b", "a", "c"]);
  assert.deepEqual(rows[0]!.labels, ["INSTALLED"]);
  assert.deepEqual(rows[1]!.labels, ["NOT INSTALLED"]);
  assert.deepEqual(rows[2]!.labels, ["NOT INSTALLED", "LAST USED"]);
});

test("a wallet being detected carries no installed label yet", () => {
  const [row] = orderWallets([mk("a", "Alpha")], { a: "checking" }, null);
  assert.deepEqual(row!.labels, []);
  assert.equal(row!.installed, "checking");
});

test("an entry without an adapter is never listed", () => {
  assert.deepEqual(orderWallets([mk("a", "Alpha"), mk("x", "Unsupported", false)], { a: true }, null).map((r) => r.entry.id), ["a"]);
});

test("search appears only above six wallets, and filters by name", () => {
  assert.equal(showSearch(1), false);
  assert.equal(showSearch(6), false);
  assert.equal(showSearch(7), true);
  const rows = orderWallets([mk("a", "Alpha"), mk("b", "Beta")], { a: true, b: true }, null);
  assert.deepEqual(filterWallets(rows, "  BET ").map((r) => r.entry.id), ["b"]);
  assert.equal(filterWallets(rows, "").length, 2);
});
