import assert from "node:assert/strict";
import { test } from "node:test";
import { redirectAfterOrgSwitch } from "../lib/access/org-switch.ts";
import { overviewOf, pendingReviews, type Bundle } from "../lib/cross-session/overview.ts";
import { INITIAL_CAP, LOAD_STEP, canLoadMore, coverageOf, nextCap, windowOf } from "../lib/cross-session/window.ts";
import { DEFAULT_QUERY, filterByState, parseQuery, serializeQuery } from "../lib/sessions/list.ts";
import { addParticipants, recoveryOf, retryFailed } from "../lib/sessions/wizard.ts";
import { workflowActions } from "../lib/sessions/workflow-actions.ts";
import { bannerHeadline } from "../lib/shell/banner.ts";
import type { AuthorizationView, ReadinessCheck, SessionDetail, SessionRow } from "../lib/tobin/types.ts";

const row = (i: number): SessionRow => ({ sessionId: `s${String(i).padStart(3, "0")}`, shortId: `s${i}`, label: `Session ${i}`, status: "Draft", participants: "not read", createdAt: `2026-11-${String(i).padStart(2, "0")}T00:00:00Z`, provenance: "local-draft", provenanceLabel: "Local draft", activityCount: 0, lastActivity: null });
const rows = (n: number) => Array.from({ length: n }, (_, i) => row(i + 1));
const detail = (workflow: SessionDetail["workflow"]): SessionDetail => ({ workflow, workspace: { overview: { sessionId: "x", label: "x", status: "x", createdAt: "2026-11-01T00:00:00Z", provenance: "local-draft" }, activity: { items: [], empty: null } } });
const auth = (state: AuthorizationView["state"], canDecide = true): AuthorizationView => ({ state, sessionState: "configuring", calculationId: "c1", eligibility: { canDecide, isReviewer: true, reasons: [] }, decisions: [] });

// ---- the cross-session window ----
test("the window is the newest 10 sessions, newest first", () => {
  const w = windowOf(rows(24), INITIAL_CAP);
  assert.equal(w.length, 10);
  assert.equal(w[0]!.label, "Session 24");
  assert.equal(w[9]!.label, "Session 15");
});

test("Load next 10 sessions extends the window by 10 and stops at the total", () => {
  let cap = INITIAL_CAP;
  const total = 24;
  assert.equal(canLoadMore(cap, total), true);
  cap = nextCap(cap, total); assert.equal(cap, 20); assert.equal(windowOf(rows(total), cap).length, 20);
  cap = nextCap(cap, total); assert.equal(cap, 24); assert.equal(canLoadMore(cap, total), false);
  assert.equal(nextCap(cap, total), 24, "never past the total");
  assert.equal(LOAD_STEP, 10);
  assert.equal(canLoadMore(10, 10), false, "nothing to load when everything is already read");
  assert.equal(canLoadMore(10, 3), false);
});

test("coverage says exactly how much the figures are based on", () => {
  assert.equal(coverageOf(10, 24).text, "Based on 10 of 24 sessions");
  assert.equal(coverageOf(24, 24).text, "Based on all 24 sessions");
  assert.equal(coverageOf(1, 1).text, "Based on all 1 session");
  assert.equal(coverageOf(0, 0).text, "No sessions yet");
  assert.equal(coverageOf(8, 10, 2).text, "Based on 8 of 10 sessions. 2 could not be read and are left out.");
  assert.equal(coverageOf(10, 10, 0).complete, true);
  assert.equal(coverageOf(9, 10, 1).complete, false);
});

test("a session that failed to read is left out of the counts and reported, never counted as zero", () => {
  const rs = rows(3);
  const bundles: Bundle[] = [
    { row: rs[2]!, detail: detail("configuring"), authorization: auth("awaiting-review"), failed: false },
    { row: rs[1]!, detail: detail("ready"), failed: false },
    { row: rs[0]!, failed: true },
  ];
  const f = overviewOf(rs, bundles, { canDecide: true, canRecalculate: true }, null);
  assert.deepEqual(f.byWorkflow, { configuring: 1, ready: 1, closed: 0 });
  assert.equal(f.coverage.text, "Based on 2 of 3 sessions. 1 could not be read and is left out.");
  assert.equal(f.awaitingReview, 1);
  assert.equal(f.sessionsTotal, 3, "the total is the real list length");
});

test("attention lists reviews for reviewers, recalculation for admins, and invitations", () => {
  const rs = rows(3);
  const bundles: Bundle[] = [
    { row: rs[0]!, detail: detail("configuring"), authorization: auth("awaiting-review"), failed: false },
    { row: rs[1]!, detail: detail("configuring"), authorization: auth("stale"), failed: false },
    { row: rs[2]!, detail: detail("configuring"), authorization: auth("awaiting-review", false), failed: false },
  ];
  const reviewer = overviewOf(rs, bundles, { canDecide: true, canRecalculate: false }, null);
  assert.deepEqual(reviewer.attention.map((a) => a.kind), ["review"], "a reviewer who cannot decide one (separation of duties) is not asked to");
  const admin = overviewOf(rs, bundles, { canDecide: false, canRecalculate: true }, 2);
  assert.deepEqual(admin.attention.map((a) => a.kind), ["invitations", "stale"]);
  const member = overviewOf(rs, bundles, { canDecide: false, canRecalculate: false }, null);
  assert.equal(member.attention.length, 0);
});

test("the Reviews count reads only what was loaded: null until then, and only for reviewers", () => {
  const rs = rows(2);
  assert.equal(pendingReviews([], { canDecide: true }), null, "nothing loaded yet");
  assert.equal(pendingReviews([{ row: rs[0]!, detail: detail("configuring"), failed: false }], { canDecide: true }), null, "no authorization loaded");
  assert.equal(pendingReviews([{ row: rs[0]!, authorization: auth("awaiting-review"), failed: false }, { row: rs[1]!, authorization: auth("approved"), failed: false }], { canDecide: true }), 1);
  assert.equal(pendingReviews([{ row: rs[0]!, authorization: auth("awaiting-review"), failed: false }], { canDecide: false }), null);
});

// ---- the banner ----
test("the banner headline is a real count or NO DATA", () => {
  assert.equal(bannerHeadline("Sessions", 24), "Sessions: 24");
  assert.equal(bannerHeadline("Sessions", 0), "Sessions: 0");
  assert.equal(bannerHeadline("Sessions", null), "Sessions: NO DATA");
  assert.equal(bannerHeadline("Sessions", undefined), "Sessions: NO DATA");
});

// ---- Mark ready and Close session ----
const check = (key: string, label: string, ok: boolean): ReadinessCheck => ({ key, label, ok, fix: "fix" });
const allOk = [check("state", "The session is being configured", true), check("participants", "At least two active participants", true), check("calculation", "A calculation exists", true), check("current", "The latest calculation is current", true)];
const admin = { role: "admin", reviewer: false } as const;
const member = { role: "member", reviewer: true } as const;

test("only an administrator can mark ready or close, and the reason says so", () => {
  const w = workflowActions({ workflow: "configuring", checks: allOk, batch: "none", actor: member, reviewed: true });
  assert.equal(w.markReady.enabled, false);
  assert.match(w.markReady.reason ?? "", /administrator/i);
  assert.equal(w.close.enabled, false);
  assert.match(w.close.reason ?? "", /administrator/i);
  assert.equal(w.primary, null);
});

test("Mark ready needs a configuring session and every readiness check except the state check", () => {
  assert.equal(workflowActions({ workflow: "configuring", checks: allOk, batch: "none", actor: admin, reviewed: true }).markReady.enabled, true);
  const bad = [...allOk.slice(0, 2), check("calculation", "A calculation exists", false), check("current", "The latest calculation is current", false)];
  const r = workflowActions({ workflow: "configuring", checks: bad, batch: "none", actor: admin, reviewed: true }).markReady;
  assert.equal(r.enabled, false);
  assert.equal(r.reason, "Not ready yet: a calculation exists; the latest calculation is current.");
  assert.match(workflowActions({ workflow: "ready", checks: allOk, batch: "none", actor: admin, reviewed: true }).markReady.reason ?? "", /already marked ready/);
  assert.match(workflowActions({ workflow: "closed", checks: allOk, batch: "none", actor: admin, reviewed: true }).markReady.reason ?? "", /closed/);
  assert.match(workflowActions({ workflow: "configuring", checks: null, batch: "none", actor: admin, reviewed: true }).markReady.reason ?? "", /could not be read/);
});

test("Close session needs a ready session and an approved settlement for the current calculation", () => {
  assert.match(workflowActions({ workflow: "configuring", checks: allOk, batch: "approved", actor: admin, reviewed: true }).close.reason ?? "", /Mark the session ready first/);
  for (const b of ["none", "awaiting-review", "rejected", "invalidated", "superseded"] as const) {
    const c = workflowActions({ workflow: "ready", checks: allOk, batch: b, actor: admin, reviewed: true }).close;
    assert.equal(c.enabled, false, b);
    assert.match(c.reason ?? "", /approved settlement/);
  }
  assert.equal(workflowActions({ workflow: "ready", checks: allOk, batch: "approved", actor: admin, reviewed: true }).close.enabled, true);
  assert.match(workflowActions({ workflow: "ready", checks: allOk, batch: null, actor: admin, reviewed: true }).close.reason ?? "", /could not be read/);
  assert.match(workflowActions({ workflow: "closed", checks: allOk, batch: "approved", actor: admin, reviewed: true }).close.reason ?? "", /already closed/);
});

test("Mark ready is offered as the primary only after the calculation is reviewed, though the console does not require it", () => {
  const w = workflowActions({ workflow: "configuring", checks: allOk, batch: "none", actor: admin, reviewed: false });
  assert.equal(w.markReady.enabled, true);
  assert.equal(w.primary, null);
});

test("exactly one primary: Close first, then Mark ready, otherwise none", () => {
  assert.equal(workflowActions({ workflow: "ready", checks: allOk, batch: "approved", actor: admin, reviewed: true }).primary, "close");
  assert.equal(workflowActions({ workflow: "configuring", checks: allOk, batch: "none", actor: admin, reviewed: true }).primary, "ready");
  assert.equal(workflowActions({ workflow: "ready", checks: allOk, batch: "none", actor: admin, reviewed: true }).primary, null);
  assert.equal(workflowActions({ workflow: "closed", checks: allOk, batch: "approved", actor: admin, reviewed: true }).primary, null);
});

// ---- the wizard's recovery ----
const reasonOf = (e: unknown) => (e instanceof Error ? e.message : String(e));
const people = [{ userId: "u1", name: "Alice" }, { userId: "u2", name: "Bob" }, { userId: "u3", name: "Carol" }];

test("adding participants keeps going when some fail and reports exactly which", async () => {
  const calls: string[] = [];
  const out = await addParticipants(people, async (id) => { calls.push(id); if (id === "u2") throw new Error("not a member"); }, reasonOf);
  assert.deepEqual(calls, ["u1", "u2", "u3"]);
  assert.deepEqual(out.added.map((a) => a.name), ["Alice", "Carol"]);
  assert.deepEqual(out.failed, [{ userId: "u2", name: "Bob", reason: "not a member" }]);
  const r = recoveryOf(out);
  assert.equal(r.kind, "partial");
  if (r.kind === "partial") assert.equal(r.headline, "1 participant was not added");
});

test("retry adds only the participants that failed, and what was added stays added", async () => {
  const first = await addParticipants(people, async (id) => { if (id !== "u1") throw new Error("busy"); }, reasonOf);
  assert.equal(first.failed.length, 2);
  const calls: string[] = [];
  const second = await retryFailed(first, async (id) => { calls.push(id); if (id === "u3") throw new Error("still failing"); }, reasonOf);
  assert.deepEqual(calls, ["u2", "u3"], "Alice is not asked again");
  assert.deepEqual(second.added.map((a) => a.name), ["Alice", "Bob"]);
  assert.deepEqual(second.failed.map((f) => [f.name, f.reason]), [["Carol", "still failing"]]);
  const third = await retryFailed(second, async () => undefined, reasonOf);
  assert.deepEqual(third.failed, []);
  assert.deepEqual(recoveryOf(third), { kind: "complete" });
  assert.equal((recoveryOf(first) as { headline: string }).headline, "2 participants were not added");
});

// ---- the organization switch ----
test("switching organization on a session URL goes to the Sessions list with a notice", () => {
  const to = "/sessions?notice=org-changed";
  assert.equal(redirectAfterOrgSwitch("/sessions/" + "a".repeat(64)), to);
  assert.equal(redirectAfterOrgSwitch("/sessions/" + "a".repeat(64) + "/anything"), to);
  assert.equal(redirectAfterOrgSwitch("/sessions"), null);
  assert.equal(redirectAfterOrgSwitch("/sessions/new"), null, "the create page belongs to no session");
  assert.equal(redirectAfterOrgSwitch("/obligations"), null);
  assert.equal(redirectAfterOrgSwitch("/"), null);
});

// ---- the sessions list ----
test("the status filter is in the URL, defaults are omitted, and unknown values fall back", () => {
  assert.equal(serializeQuery(DEFAULT_QUERY), "");
  assert.equal(serializeQuery({ ...DEFAULT_QUERY, status: "ready" }), "?status=ready");
  assert.equal(parseQuery(new URLSearchParams("status=closed")).status, "closed");
  assert.equal(parseQuery(new URLSearchParams("status=bogus")).status, "all");
});

test("a status filter works on rows whose state was read and counts the rest as unknown", () => {
  const rs = rows(4);
  const states = { [rs[0]!.sessionId]: "ready", [rs[1]!.sessionId]: "configuring", [rs[2]!.sessionId]: "ready", [rs[3]!.sessionId]: undefined } as const;
  const f = filterByState(rs, states, "ready");
  assert.deepEqual(f.rows.map((r) => r.sessionId), [rs[0]!.sessionId, rs[2]!.sessionId]);
  assert.equal(f.unknown, 1);
  assert.equal(filterByState(rs, states, "all").rows.length, 4);
});
