import assert from "node:assert/strict";
import test from "node:test";
import { applyActivityFilter, deriveActivity, eventKinds, NO_FILTER, outcomeOf } from "../lib/activity/derive.ts";
import { canRevokeInvitation, invitationState, lastActiveAdmin, REMOVE_CONSEQUENCES, walletRows } from "../lib/org/rules.ts";
import { capabilitiesFor, roleDifferences } from "../lib/permissions/can.ts";
import type { Member, SessionRow } from "../lib/tobin/types.ts";

const row = (i: number): SessionRow => ({ sessionId: `s${i}`, shortId: "x", label: `S${i}`, status: "", participants: "", createdAt: "2026-01-01", provenance: "local-draft", provenanceLabel: "", activityCount: 0, lastActivity: null });
const ev = (at: string, kind: string, detail = "d") => ({ at, kind, actor: "Alice", detail });

test("outcome is derived from the event kind only", () => {
  assert.equal(outcomeOf("netting.failed"), "Refused");
  assert.equal(outcomeOf("authorization.rejected"), "Rejected");
  assert.equal(outcomeOf("settlement.batch-rejected"), "Rejected");
  assert.equal(outcomeOf("authorization.invalidated"), "No longer applies");
  assert.equal(outcomeOf("obligation.created"), "Recorded");
});

test("derived activity: newest first, capped and labelled, unreadable sessions reported", () => {
  const rows = Array.from({ length: 12 }, (_, i) => row(i));
  const d = deriveActivity(rows, [
    { row: rows[0]!, items: [ev("2026-01-02T00:00:00Z", "session.recorded")], failed: false },
    { row: rows[1]!, items: [ev("2026-01-03T00:00:00Z", "netting.failed"), ev("2026-01-01T00:00:00Z", "obligation.created")], failed: false },
    { row: rows[2]!, failed: true },
  ]);
  assert.deepEqual(d.entries.map((e) => e.at.slice(0, 10)), ["2026-01-03", "2026-01-02", "2026-01-01"]);
  assert.equal(d.capped, true); assert.equal(d.sessionsTotal, 12); assert.equal(d.sessionsRead, 2); assert.equal(d.unreadable, 1);
  assert.equal(d.entries[0]?.outcome, "Refused");
  assert.equal(d.entries[0]?.sessionLabel, "S1");
});

test("activity filters: kind, session, outcome and an inclusive UTC date range", () => {
  const rows = [row(1), row(2)];
  const d = deriveActivity(rows, [
    { row: rows[0]!, items: [ev("2026-01-05T10:00:00Z", "obligation.created"), ev("2026-01-10T23:59:00Z", "netting.failed")], failed: false },
    { row: rows[1]!, items: [ev("2026-01-10T00:00:00Z", "authorization.rejected")], failed: false },
  ]);
  const all = d.entries;
  assert.equal(applyActivityFilter(all, NO_FILTER).length, 3);
  assert.equal(applyActivityFilter(all, { ...NO_FILTER, kind: "netting.failed" }).length, 1);
  assert.equal(applyActivityFilter(all, { ...NO_FILTER, sessionId: "s2" }).length, 1);
  assert.equal(applyActivityFilter(all, { ...NO_FILTER, outcome: "Rejected" }).length, 1);
  assert.equal(applyActivityFilter(all, { ...NO_FILTER, from: "2026-01-10", to: "2026-01-10" }).length, 2, "both bounds are inclusive for the whole day");
  assert.equal(applyActivityFilter(all, { ...NO_FILTER, from: "garbage", to: "" }).length, 3, "an invalid bound is ignored");
  assert.deepEqual(eventKinds(all), ["authorization.rejected", "netting.failed", "obligation.created"]);
});

test("role change: the real permission differences, derived from can()", () => {
  const down = roleDifferences("admin", "member");
  assert.equal(down.gains.length, 0);
  assert.ok(down.losses.includes("Record obligations") && down.losses.includes("Prepare settlement") && down.losses.includes("Change roles, suspend or remove members"));
  assert.ok(!down.losses.some((l) => /needs the reviewer capability/.test(l)), "deciding needs the separate reviewer grant, so it is not a role difference (granting it is, and is listed)");
  const up = roleDifferences("member", "admin");
  assert.deepEqual(up.gains, down.losses);
  assert.deepEqual(roleDifferences("admin", "admin"), { gains: [], losses: [] });
  assert.ok(capabilitiesFor({ role: "member", reviewer: false }).includes("activity.view"));
});

test("invitation states: pending past its expiry is Expired, and only a live pending invitation can be revoked", () => {
  const now = Date.parse("2026-01-10T00:00:00Z");
  assert.equal(invitationState({ status: "pending", expiresAt: "2026-01-11T00:00:00Z" }, now), "Pending");
  assert.equal(invitationState({ status: "pending", expiresAt: "2026-01-09T00:00:00Z" }, now), "Expired");
  assert.equal(invitationState({ status: "accepted", expiresAt: "2026-01-09T00:00:00Z" }, now), "Accepted");
  assert.equal(invitationState({ status: "revoked", expiresAt: "2026-02-09T00:00:00Z" }, now), "Revoked");
  assert.equal(canRevokeInvitation({ status: "pending", expiresAt: "2026-01-11T00:00:00Z" }, now), true);
  assert.equal(canRevokeInvitation({ status: "pending", expiresAt: "2026-01-09T00:00:00Z" }, now), false);
  assert.equal(canRevokeInvitation({ status: "accepted", expiresAt: "2026-01-11T00:00:00Z" }, now), false);
});

const m = (userId: string, role: "admin" | "member", status: "active" | "suspended" = "active"): Member => ({ userId, role, reviewer: false, since: "", status, name: userId, you: false });
test("last active administrator is recognised (so the UI can explain before the server refuses)", () => {
  assert.equal(lastActiveAdmin([m("a", "admin"), m("b", "member")], "a"), true);
  assert.equal(lastActiveAdmin([m("a", "admin"), m("b", "admin")], "a"), false);
  assert.equal(lastActiveAdmin([m("a", "admin"), m("b", "admin", "suspended")], "a"), true, "a suspended administrator does not count");
  assert.equal(lastActiveAdmin([m("a", "admin"), m("b", "member")], "b"), false);
});
test("remove consequences are the backend's real rules", () => {
  const t = REMOVE_CONSEQUENCES.join(" ");
  assert.match(t, /active obligations/); assert.match(t, /last active administrator/); assert.match(t, /invalidated/);
});

test("wallet rows keep connection (browser) and verification (backend) as separate facts", () => {
  const w = [{ id: "w1", publicKey: "GA", network: "testnet", verifiedAt: "2026-01-01" }, { id: "w2", publicKey: "GB", network: "testnet", verifiedAt: "2026-01-02" }];
  const rows = walletRows(w, "GA");
  assert.equal(rows[0]?.connection, "Connected in this browser");
  assert.equal(rows[1]?.connection, "Not connected in this browser");
  assert.ok(rows.every((r) => r.verification === "Verified"));
  assert.equal(walletRows(w, null)[0]?.connection, "Not connected in this browser", "no browser wallet means nothing is connected");
  assert.equal("provider" in rows[0]!, false, "the backend returns no provider, so none is shown");
});
