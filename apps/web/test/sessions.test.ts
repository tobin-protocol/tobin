import assert from "node:assert/strict";
import test from "node:test";
import { applyQuery, DEFAULT_QUERY, PAGE_SIZE, parseQuery, serializeQuery } from "../lib/sessions/list.ts";
import { GROUPS, lifecycleOf, type LifecycleFacts } from "../lib/sessions/lifecycle.ts";
import { nextActionOf } from "../lib/sessions/next-action.ts";
import type { SessionRow } from "../lib/tobin/types.ts";

const row = (i: number, over: Partial<SessionRow> = {}): SessionRow => ({
  sessionId: String(i).padStart(64, "0"), shortId: "x", label: `Run ${i}`, status: "Draft (not on-chain)", participants: "not read",
  createdAt: `2026-01-${String(i).padStart(2, "0")}T00:00:00.000Z`, provenance: "local-draft", provenanceLabel: "Local draft", activityCount: i % 2,
  lastActivity: i % 2 ? `2026-02-${String(i).padStart(2, "0")}T00:00:00.000Z` : null, ...over,
});
const rows = Array.from({ length: 25 }, (_, i) => row(i + 1));
const params = (s: string) => new URLSearchParams(s);

test("URL state round-trips and defaults are omitted", () => {
  assert.equal(serializeQuery(DEFAULT_QUERY), "");
  const q = { ...DEFAULT_QUERY, q: "run", sort: "label" as const, dir: "asc" as const, page: 2, hasActivity: true };
  assert.deepEqual(parseQuery(params(serializeQuery(q).slice(1))), q);
});
test("hostile URL values fall back to defaults", () => {
  assert.deepEqual(parseQuery(params("provenance=%3Cscript%3E&sort=drop&dir=sideways&page=-4&activity=yes")), DEFAULT_QUERY);
  assert.equal(parseQuery(params("page=abc")).page, 1);
});
test("search matches label or id, case-insensitively", () => {
  assert.equal(applyQuery(rows, { ...DEFAULT_QUERY, q: "RUN 12" }).matched, 1);
  assert.equal(applyQuery(rows, { ...DEFAULT_QUERY, q: "0000000000000000000000000000000000000000000000000000000000000007" }).matched, 1);
});
test("filters, sort and pagination work together, and a page past the end is clamped", () => {
  const all = applyQuery(rows, DEFAULT_QUERY);
  assert.equal(all.rows.length, PAGE_SIZE);
  assert.equal(all.pages, 3);
  assert.equal(all.rows[0]?.label, "Run 25");
  assert.equal(applyQuery(rows, { ...DEFAULT_QUERY, page: 99 }).page, 3);
  assert.equal(applyQuery(rows, { ...DEFAULT_QUERY, hasActivity: true }).matched, 13);
  assert.equal(applyQuery(rows, { ...DEFAULT_QUERY, provenance: "fixture" }).matched, 0);
  assert.equal(applyQuery(rows, { ...DEFAULT_QUERY, sort: "label", dir: "asc" }).rows[0]?.label, "Run 1");
});

const facts = (o: Partial<LifecycleFacts> = {}): LifecycleFacts => ({ workflow: "configuring", activeParticipants: 3, activeObligations: 3, currency: "current", auth: "approved", ...o });
test("lifecycle: the first incomplete group is current", () => {
  assert.equal(lifecycleOf(facts({ activeParticipants: 1 })).currentIndex, 1);
  assert.equal(lifecycleOf(facts({ activeObligations: 0 })).currentIndex, 2);
  assert.equal(lifecycleOf(facts({ currency: "none" })).currentIndex, 3);
  assert.equal(lifecycleOf(facts({ currency: "stale" })).currentIndex, 3);
  assert.equal(lifecycleOf(facts({ auth: "awaiting-review" })).currentIndex, 4);
  assert.equal(lifecycleOf(facts({ auth: "rejected" })).currentIndex, 4);
  assert.equal(lifecycleOf(facts()).currentIndex, 5);
  assert.equal(lifecycleOf(facts({ workflow: "closed" })).currentIndex, GROUPS.length);
});
test("lifecycle: an unreadable fact stops the walk and is never treated as done", () => {
  const v = lifecycleOf(facts({ activeObligations: null }));
  assert.equal(v.currentIndex, 2);
  assert.equal(v.unread, true);
  assert.equal(lifecycleOf(facts({ auth: null })).unread, true);
});

const admin = { role: "admin" as const, reviewer: false };
const member = { role: "member" as const, reviewer: false };
test("next action: a member sees the reason, an admin sees the action", () => {
  const v = lifecycleOf(facts({ activeParticipants: 0 }));
  const a = nextActionOf(v, "configuring", admin);
  assert.equal(a.primary?.blockedBy, null);
  assert.equal(a.forYou, true);
  const m = nextActionOf(v, "configuring", member);
  assert.equal(m.forYou, false);
  assert.match(m.reason ?? "", /Only administrators/);
});
test("next action: later-phase actions are blocked with their phase, never enabled", () => {
  const a = nextActionOf(lifecycleOf(facts({ currency: "none" })), "configuring", admin);
  assert.match(a.primary?.blockedBy ?? "", /Phase C/);
  const r = nextActionOf(lifecycleOf(facts({ auth: "awaiting-review" })), "configuring", { role: "member", reviewer: true });
  assert.match(r.primary?.blockedBy ?? "", /Phase D/);
  assert.equal(r.forYou, true);
});
test("next action: a closed session has no action", () => {
  const a = nextActionOf(lifecycleOf(facts({ workflow: "closed" })), "closed", admin);
  assert.equal(a.primary, null);
  assert.ok(a.reason);
});
