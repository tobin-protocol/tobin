import assert from "node:assert/strict";
import { test } from "node:test";
import { can, roleLabels, PRD_ROLE_HELP, type Capability } from "../lib/permissions/can.ts";
import { derive, selectForReading, SESSION_REQUEST_CAP, type SessionBundle } from "../lib/derived/overview.ts";
import { decide } from "../lib/proxy-policy.ts";
import { formatAmount, groupDigits, middle } from "../lib/format.ts";
import type { AuthorizationView, SessionRow } from "../lib/tobin/types.ts";

const row = (n: number): SessionRow => ({
  sessionId: n.toString(16).padStart(64, "0"), shortId: `s${n}`, label: `Session ${n}`, status: "Draft (not on-chain)", participants: "not read",
  createdAt: `2026-01-${String(n).padStart(2, "0")}T00:00:00.000Z`, provenance: "local-draft", provenanceLabel: "Local draft", activityCount: 0, lastActivity: null,
});
const auth = (state: AuthorizationView["state"], canDecide: boolean): AuthorizationView => ({ state, sessionState: "configuring", calculationId: "c1", eligibility: { canDecide, isReviewer: canDecide, reasons: [] }, decisions: [] });

// ---- permissions mirror the backend rules (D5) ----
test("every write capability is admin-only; reading needs only membership", () => {
  const writes: Capability[] = ["org.edit", "members.manage", "invitations.manage", "sessions.create", "participants.manage", "obligations.record", "obligations.correct", "netting.run", "settlement.prepare", "execution.begin", "wallets.link"];
  for (const c of writes) {
    assert.equal(can({ role: "admin", reviewer: false }, c).allowed, true, c);
    const m = can({ role: "member", reviewer: true }, c);
    assert.equal(m.allowed, false, `${c} must stay admin-only even for a reviewer`);
    assert.match(m.reason ?? "", /administrators/);
  }
  for (const c of ["org.view", "sessions.view", "obligations.view", "activity.view", "wallets.verify"] as Capability[]) assert.equal(can({ role: "member", reviewer: false }, c).allowed, true, c);
});

test("deciding needs the reviewer grant, not the admin role", () => {
  for (const c of ["authorization.decide", "settlement.decide"] as Capability[]) {
    assert.equal(can({ role: "admin", reviewer: false }, c).allowed, false);
    assert.equal(can({ role: "member", reviewer: true }, c).allowed, true);
    assert.match(can({ role: "admin", reviewer: false }, c).reason ?? "", /separation of duties/);
  }
});

test("a suspended membership has no access at all", () => {
  assert.equal(can({ role: "admin", reviewer: true, suspended: true }, "org.view").allowed, false);
});

test("role labels are the real names; the PRD names appear only in help text", () => {
  assert.deepEqual(roleLabels({ role: "admin", reviewer: false }), ["Admin"]);
  assert.deepEqual(roleLabels({ role: "member", reviewer: true }), ["Member", "Reviewer"]);
  for (const forbidden of ["Operator", "Approver", "Owner", "Viewer"]) for (const r of [{ role: "admin" as const, reviewer: true }, { role: "member" as const, reviewer: false }]) assert.ok(!roleLabels(r).includes(forbidden));
  assert.ok(PRD_ROLE_HELP.some((h) => h.real === "Owner" && /does not exist/.test(h.prd)));
});

// ---- derived data and the request cap (D6) ----
test("the number of sessions read is capped, newest first, and the cap is reported", () => {
  const rows = Array.from({ length: 25 }, (_, i) => row(i + 1));
  const read = selectForReading(rows);
  assert.equal(read.length, SESSION_REQUEST_CAP);
  assert.equal(read[0]?.label, "Session 25");
  const d = derive(rows, read.map((r): SessionBundle => ({ row: r, failed: false })), { canDecide: false, canRecalculate: false }, null);
  assert.equal(d.sessionsTotal, 25, "the total comes from the one list response, not from the capped reads");
  assert.equal(d.sessionsRead, 10);
  assert.equal(d.capped, true);
});

test("no cap notice when every session was read", () => {
  const rows = [row(1), row(2)];
  const d = derive(rows, rows.map((r): SessionBundle => ({ row: r, failed: false })), { canDecide: false, canRecalculate: false }, null);
  assert.equal(d.capped, false);
});

test("attention items need the right capability; failed sessions are excluded and counted", () => {
  const rows = [row(1), row(2), row(3)];
  const bundles: SessionBundle[] = [
    { row: rows[0]!, failed: false, authorization: auth("awaiting-review", true), obligations: [{ id: "1", debtor: "a", debtorName: "A", creditor: "b", creditorName: "B", amount: "100", asset: "USD", status: "active", revision: 1, createdAt: "x" }, { id: "2", debtor: "a", debtorName: "A", creditor: "b", creditorName: "B", amount: "5", asset: "USD", status: "voided", revision: 2, createdAt: "x" }] },
    { row: rows[1]!, failed: false, authorization: auth("stale", false) },
    { row: rows[2]!, failed: true },
  ];
  const reviewer = derive(rows, bundles, { canDecide: true, canRecalculate: false }, 2);
  assert.deepEqual(reviewer.attention.map((a) => a.kind), ["review", "invitations"]);
  assert.equal(reviewer.unreadable, 1);
  assert.equal(reviewer.obligationsActive, 1);
  assert.equal(reviewer.obligationsVoided, 1);
  const admin = derive(rows, bundles, { canDecide: false, canRecalculate: true }, null);
  assert.deepEqual(admin.attention.map((a) => a.kind), ["stale"]);
});

// ---- the proxy allow-list (D2) ----
test("the proxy forwards only auth and registry, only GET and POST, and refuses traversal", () => {
  assert.deepEqual(decide("GET", ["auth", "me"]), { ok: true, path: "/api/auth/me" });
  assert.deepEqual(decide("POST", ["registry", "orgs"]), { ok: true, path: "/api/registry/orgs" });
  for (const seg of [["stellar", "run"], ["rpc"], ["bootstrap"], ["w0", "x"], ["health"], ["authx"]]) assert.equal(decide("POST", seg).ok, false, seg.join("/"));
  assert.equal(decide("DELETE", ["auth", "me"]).ok, false);
  assert.equal(decide("GET", ["auth", "..", "stellar", "run"]).ok, false);
  assert.equal(decide("GET", ["auth", "%2e%2e"]).ok, false);
});

// ---- amounts are never bare ----
test("amounts always carry their asset and are never converted to floats", () => {
  assert.equal(formatAmount("1200000", "USD"), "1,200,000 USD");
  assert.equal(formatAmount("9007199254740993123", "USD"), "9,007,199,254,740,993,123 USD");
  assert.equal(formatAmount(null, "USD"), "No data");
  assert.match(formatAmount("5", ""), /\(no asset\)/);
  assert.equal(groupDigits("-1234"), "-1,234");
  const id = "GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVW";
  assert.equal(middle(id), `${id.slice(0, 6)}…${id.slice(-4)}`);
  assert.equal(middle("short"), "short");
});
