import assert from "node:assert/strict";
import { test } from "node:test";
import { runWalletSignIn, type SignInState } from "../lib/wallet/signin.ts";
import { TESTNET_PASSPHRASE, type FreighterLike } from "../lib/wallet/freighter.ts";

// A hand-written MOCK of the Freighter API, used only in these tests. The server challenge and verification are injected too: this tests the SEQUENCE and the
// failure states, not the extension and not the backend.
const ADDR = "GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVW";
const wallet = (over: Partial<FreighterLike> = {}): FreighterLike => ({
  isConnected: async () => ({ isConnected: true }),
  isAllowed: async () => ({ isAllowed: true }),
  requestAccess: async () => ({ address: ADDR }),
  getAddress: async () => ({ address: ADDR }),
  getNetwork: async () => ({ network: "TESTNET", networkPassphrase: TESTNET_PASSPHRASE }),
  signMessage: async () => ({ signedMessage: "c2lnbmVk", signerAddress: ADDR }),
  ...over,
});
const future = () => new Date(Date.now() + 60_000).toISOString();
const deps = (api: FreighterLike | undefined, over: Record<string, unknown> = {}) => ({
  api,
  challenge: async () => ({ challenge: { id: "ch1", message: "sign me", expiresAt: future() } }),
  verify: async () => ({ isNew: false }),
  ...over,
});
const run = (api: FreighterLike | undefined, over: Record<string, unknown> = {}) => runWalletSignIn(deps(api, over));

test("happy path: connect, challenge, sign, verify", async () => {
  const seen: SignInState[] = [];
  const o = await run(wallet(), { onState: (s: SignInState) => seen.push(s) });
  assert.equal(o.state, "authenticated");
  assert.deepEqual(seen, ["detecting", "connecting", "requesting-challenge", "awaiting-approval", "verifying", "authenticated"]);
});

test("wallet not installed", async () => assert.equal((await run(undefined)).state, "unavailable"));
test("freighter present but not answering", async () => assert.equal((await run(wallet({ isConnected: async () => ({ isConnected: false }) }))).state, "unavailable"));
test("connection rejected", async () => assert.equal((await run(wallet({ requestAccess: async () => ({ address: "", error: { message: "User declined access" } }) as never }))).state, "rejected"));
test("locked wallet", async () => assert.equal((await run(wallet({ requestAccess: async () => ({ address: "", error: { message: "wallet is locked" } }) as never }))).state, "locked"));
test("wrong network", async () => assert.equal((await run(wallet({ getNetwork: async () => ({ network: "PUBLIC", networkPassphrase: "Public Global Stellar Network ; September 2015" }) }))).state, "wrong-network"));
test("signing rejected", async () => assert.equal((await run(wallet({ signMessage: async () => ({ signedMessage: null, signerAddress: "", error: { message: "User declined" } }) as never }))).state, "rejected"));
test("signing timeout", async () => assert.equal((await run(wallet({ signMessage: () => new Promise(() => {}) }), { timeoutMs: 20 })).state, "failed"));
test("a different account signed", async () => assert.equal((await run(wallet({ signMessage: async () => ({ signedMessage: "c2ln", signerAddress: "GOTHER" + "A".repeat(50) }) }))).state, "account-changed"));
test("expired challenge", async () => assert.equal((await run(wallet(), { challenge: async () => ({ challenge: { id: "c", message: "m", expiresAt: new Date(Date.now() - 1000).toISOString() } }) })).state, "expired"));
test("invalid signature reported by the server", async () => assert.equal((await run(wallet(), { verify: async () => { throw Object.assign(new Error("bad"), { status: 401 }); } })).state, "failed"));
test("rate limited on the challenge", async () => assert.equal((await run(wallet(), { challenge: async () => { throw Object.assign(new Error("slow down"), { status: 429 }); } })).state, "rate-limited"));
