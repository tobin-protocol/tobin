import assert from "node:assert/strict";
import { test } from "node:test";
import { reviewQueue, reviewsBadge, mineOf } from "../lib/cross-session/reviews.ts";
import type { Bundle } from "../lib/cross-session/overview.ts";
import { lastActiveAdmin } from "../lib/org/rules.ts";
import { HISTORY_UNAVAILABLE, obligationHistory } from "../lib/obligations/rules.ts";
import { COMMAND_CAP_NOTE, commandSessions } from "../lib/shell/command.ts";

const row = (id: string) => ({ sessionId: id, shortId: id, label: `S ${id}`, status: "x", participants: "", createdAt: "2026-01-01T00:00:00Z" }) as never;
const auth = (state: string, canDecide: boolean) => ({ state, sessionState: "ready", calculationId: "c", eligibility: { canDecide, isReviewer: true, reasons: canDecide ? [] : ["You recorded an obligation."] }, decisions: [] });
const batch = (by: string, status = "awaiting-review") => ({ id: "b1", attempt: 1, calculationId: "c", status, asset: { code: "USDC" }, instructionCount: 1, totalAmount: "1", preparedBy: by, preparedAt: "2026-01-02T00:00:00Z" });
const bundle = (id: string, a: unknown, batches: unknown[]): Bundle => ({ row: row(id), failed: false, authorization: a as Bundle["authorization"], settlement: { batches } as unknown as Bundle["settlement"] });
const viewer = { reviewer: true, displayName: "Rae" };

test("the queue holds calculations and settlement batches, and the badge counts the same rows as My reviews", () => {
  const bs = [bundle("1", auth("awaiting-review", true), [batch("Sam")]), bundle("2", auth("awaiting-review", false), [batch("Rae")])];
  const q = reviewQueue(bs, viewer);
  assert.equal(q.length, 4);
  assert.equal(mineOf(q).length, 2);
  assert.equal(reviewsBadge(bs, viewer, 2), mineOf(q).length);
  assert.ok(q.some((r) => r.kind === "settlement") && q.some((r) => r.kind === "calculation"));
});
test("badge is null for a non-reviewer and while the window is incomplete; failed sessions are skipped", () => {
  const bs = [bundle("1", auth("awaiting-review", true), [])];
  assert.equal(reviewsBadge(bs, { reviewer: false, displayName: "x" }, 1), null);
  assert.equal(reviewsBadge(bs, viewer, 2), null);
  assert.equal(reviewQueue([{ ...bs[0]!, failed: true }], viewer).length, 0);
});
test("a batch prepared by the viewer is not theirs to review", () => {
  const q = reviewQueue([bundle("1", auth("approved", true), [batch("Rae")])], viewer);
  assert.equal(q[0]!.mine, false);
  assert.match(q[0]!.reason ?? "", /prepared/);
});

test("obligation history refuses to mix two ids that share 8 characters", () => {
  const a = "abcdefgh-1111", b = "abcdefgh-2222";
  const h = obligationHistory(a, [a, b], [{ at: "t", kind: "obligation.recorded", actor: "x", detail: "#abcdefgh" }] as never);
  assert.equal(h.kind, "unavailable");
  assert.equal(HISTORY_UNAVAILABLE, "History unavailable for this obligation");
  assert.equal(obligationHistory(a, [a], []).kind, "ok");
});

test("command panel says when it hit the 300 cap", () => {
  const many = Array.from({ length: 301 }, (_, i) => row(String(i)));
  const r = commandSessions(many);
  assert.equal(r.items.length, 300);
  assert.equal(r.note, COMMAND_CAP_NOTE);
  assert.equal(COMMAND_CAP_NOTE, "Showing the newest 300 sessions");
  assert.equal(commandSessions(many.slice(0, 5)).note, null);
});

test("last-admin protection", () => {
  const m = (userId: string, role: string) => ({ userId, role, status: "active" }) as never;
  assert.equal(lastActiveAdmin([m("a", "admin"), m("b", "member")], "a"), true);
  assert.equal(lastActiveAdmin([m("a", "admin"), m("b", "admin")], "a"), false);
});

import { roleChangePlan, WALLET_BUTTON_LABEL, WALLET_NOTE } from "../lib/org/rules.ts";
const mem = (userId: string, role: string) => ({ userId, role, status: "active", name: userId }) as never;
const admin = { role: "admin", reviewer: false, suspended: false } as never;
const plain = { role: "member", reviewer: false, suspended: false } as never;

test("role change: administrators only, one confirmation, gains and losses listed", () => {
  const ms = [mem("a", "admin"), mem("b", "admin"), mem("c", "member")];
  const up = roleChangePlan(admin, ms, ms[2]!, "admin");
  assert.equal(up.allowed, true); assert.equal(up.canConfirm, true); assert.equal(up.confirmations, 1);
  assert.ok(up.gains.length > 0 && up.losses.length === 0);
  const down = roleChangePlan(admin, ms, ms[1]!, "member");
  assert.ok(down.losses.length > 0 && down.canConfirm);
  const member = roleChangePlan(plain, ms, ms[2]!, "admin");
  assert.equal(member.allowed, false); assert.equal(member.canConfirm, false); assert.ok(member.reason);
  assert.equal(roleChangePlan(admin, ms, ms[2]!, "member").canConfirm, false, "no change, nothing to confirm");
});
test("role change: the last active administrator cannot be demoted", () => {
  const ms = [mem("a", "admin"), mem("c", "member")];
  const p = roleChangePlan(admin, ms, ms[0]!, "member");
  assert.equal(p.blockedLastAdmin, true); assert.equal(p.canConfirm, false);
});
test("wallet wording says nothing is linked or verified", () => {
  assert.equal(WALLET_BUTTON_LABEL, "Connect a wallet");
  assert.match(WALLET_NOTE, /not available yet/);
  assert.match(WALLET_NOTE, /nothing is linked, signed or verified/);
  assert.doesNotMatch(WALLET_BUTTON_LABEL, /link/i);
});
