import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { WalletView } from "../lib/wallet/freighter.ts";
import { DISCONNECT_DESCRIPTION, DISCONNECT_LAST_METHOD_NOTE, FREIGHTER_REVOKE_NOTE, walletPopoverState, WRONG_NETWORK_MESSAGE } from "../lib/wallet/popover.ts";

const A = "GB7HKG4RRCOXVVZWGQQ";
const views: Record<string, WalletView> = {
  detecting: { kind: "DETECTING" },
  notFound: { kind: "UNAVAILABLE", reason: "Freighter is not installed or did not answer" },
  notConnected: { kind: "NOT_ALLOWED", reason: "this site has not been granted access in Freighter (or Freighter is locked)", cause: "not-granted" },
  locked: { kind: "NOT_ALLOWED", reason: "wallet is locked", cause: "locked-or-denied" },
  ready: { kind: "READY", address: A, network: "TESTNET" },
  wrong: { kind: "WRONG_NETWORK", address: A, network: "PUBLIC" },
};

test("the six popover states each have their own id, text and actions", () => {
  const s = {
    notFound: walletPopoverState(views.notFound!, false), notConnected: walletPopoverState(views.notConnected!, false), connectedVerified: walletPopoverState(views.ready!, true),
    connectedUnverified: walletPopoverState(views.ready!, false), wrong: walletPopoverState(views.wrong!, true), locked: walletPopoverState(views.locked!, false),
  };
  assert.deepEqual(Object.values(s).map((x) => x.id), ["not-found", "not-connected", "connected-verified", "connected-unverified", "wrong-network", "locked-or-denied"]);
  assert.equal(new Set(Object.values(s).map((x) => x.barLabel)).size, 6, "six different top-bar labels");
  assert.deepEqual(s.notFound.actions, ["check-again"]);
  assert.deepEqual(s.notConnected.actions, ["connect", "check-again"]);
  assert.deepEqual(s.locked.actions, ["connect", "check-again"]);
  assert.deepEqual(s.connectedVerified.actions, ["disconnect", "manage"]);
  assert.deepEqual(s.connectedUnverified.actions, ["manage"]);
  assert.deepEqual(s.wrong.actions, ["check-again"]);
  assert.deepEqual(walletPopoverState(views.detecting!, false).actions, []);
});

test("Connect Freighter and Check again never appear while connected; Disconnect appears only with a verified record", () => {
  for (const verified of [true, false]) {
    const st = walletPopoverState(views.ready!, verified);
    assert.ok(!st.actions.includes("connect") && !st.actions.includes("check-again"));
    assert.equal(st.actions.includes("disconnect"), verified);
  }
});

test("only Freighter answering on Testnet is connected; a wrong network is never connected and offers nothing that assumes testnet", () => {
  for (const [k, v] of Object.entries(views)) assert.equal(walletPopoverState(v, true).connected, k === "ready", k);
  const w = walletPopoverState(views.wrong!, true);
  assert.deepEqual(w.lines, [WRONG_NETWORK_MESSAGE]);
  assert.equal(WRONG_NETWORK_MESSAGE, "Tobin supports Stellar Testnet only in this build. Switch Freighter to Testnet.");
  assert.ok(!w.actions.some((a) => a === "connect" || a === "disconnect"));
  assert.match(w.detail ?? "", /Freighter is on PUBLIC/);
});

test("the wrong-network sentence is one shared string, used by every surface", () => {
  for (const f of ["lib/wallet/signin.ts", "components/wallets/Wallets.tsx", "lib/wallet/popover.ts"]) assert.match(readFileSync(new URL(`../${f}`, import.meta.url), "utf8"), /WRONG_NETWORK_MESSAGE/, f);
  for (const f of ["components/wallets/Wallets.tsx", "components/shell/topbar/controls.tsx", "lib/wallet/signin.ts"]) assert.doesNotMatch(readFileSync(new URL(`../${f}`, import.meta.url), "utf8"), /Switch it to Testnet|Switch it to Stellar Testnet/, f);
});

test("the Wallets tab treats only READY as a connection (a wrong network is not Connected)", () => {
  const src = readFileSync(new URL("../components/wallets/Wallets.tsx", import.meta.url), "utf8");
  assert.match(src, /const browserAddress = wallet\.wallet\.kind === "READY" \? wallet\.wallet\.address : null;/);
});

test("Disconnect wording says what Tobin does and that Freighter's site permission must be removed there", () => {
  assert.match(DISCONNECT_DESCRIPTION, /removes the verified record/);
  assert.match(DISCONNECT_DESCRIPTION, /signs out every Tobin session that used it/);
  assert.match(DISCONNECT_DESCRIPTION, /does not delete or change the Stellar account/);
  assert.match(FREIGHTER_REVOKE_NOTE, /a website cannot revoke it/);
  assert.match(FREIGHTER_REVOKE_NOTE, /Freighter's connected sites/);
  assert.match(DISCONNECT_LAST_METHOD_NOTE, /only way your account can sign in/);
});

test("one confirmation: the popover and the Wallets tab both open the same shared dialog, and neither calls the backend directly", () => {
  for (const f of ["components/shell/topbar/controls.tsx", "components/wallets/Wallets.tsx"]) {
    const src = readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
    assert.match(src, /<DisconnectWalletDialog /, f);
    assert.doesNotMatch(src, /removeWallet\(/, f);
  }
  assert.equal((readFileSync(new URL("../components/wallets/DisconnectWalletDialog.tsx", import.meta.url), "utf8").match(/removeWallet\(/g) ?? []).length, 1);
});
