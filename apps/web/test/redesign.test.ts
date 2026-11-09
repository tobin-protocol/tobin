import assert from "node:assert/strict";
import test from "node:test";
import { entityOf } from "../lib/activity/entity.ts";
import { relevantSessions, stageOf } from "../lib/derived/relevant-sessions.ts";
import type { SessionBundle } from "../lib/derived/overview.ts";
import { transitionOf, transitionText } from "../lib/obligations/rules.ts";
import { stateLayers, type LayerInput } from "../lib/sessions/layers.ts";
import type { AuthState, BatchStatus, Currency, ObligationView, SessionRow, WorkflowState } from "../lib/tobin/types.ts";

const row = (i: number, createdAt = `2026-01-0${i}T00:00:00.000Z`): SessionRow => ({ sessionId: `s${i}`, shortId: "x", label: `S${i}`, status: "", participants: "", createdAt, provenance: "local-draft", provenanceLabel: "", activityCount: 0, lastActivity: null });
const ob = (status: "active" | "voided" = "active"): ObligationView => ({ id: "o", debtor: "a", debtorName: "A", creditor: "b", creditorName: "B", amount: "1", asset: "USD", status, revision: 1, createdAt: "2026-01-01" });
const auth = (state: AuthState, canDecide = false) => ({ state, sessionState: "configuring" as WorkflowState, calculationId: null, eligibility: { canDecide, isReviewer: canDecide, reasons: [] }, decisions: [] });
const bundle = (i: number, over: Partial<SessionBundle> & { workflow?: WorkflowState } = {}): SessionBundle => ({
  row: row(i), failed: false,
  detail: { workflow: over.workflow ?? "configuring", workspace: { overview: { sessionId: `s${i}`, label: `S${i}`, status: "", createdAt: "", provenance: "local-draft" }, activity: { items: [], empty: null } } },
  ...over,
});
const WHO = { canDecide: true, canRecalculate: true };

test("state layers: five layers, kept apart, with the blockchain layer never recorded", () => {
  const l = stateLayers({ workflow: "configuring", provenance: "local-draft", currency: "current", auth: "approved", batch: "approved" });
  assert.deepEqual(l.map((x) => x.key), ["application", "calculated", "approval", "settlement", "chain"]);
  assert.equal(l[4]?.recorded, false);
  assert.equal(l[4]?.value, "Not recorded");
  assert.equal(l.slice(0, 4).every((x) => x.recorded), true);
});
test("state layers: no combination of real states ever reads settled or confirmed", () => {
  const currencies: (Currency | null)[] = [null, "none", "current", "stale"];
  const auths: (AuthState | null)[] = [null, "no-calculation", "stale", "awaiting-review", "approved", "rejected"];
  const batches: (BatchStatus | "none" | null)[] = [null, "none", "awaiting-review", "approved", "rejected", "invalidated", "superseded"];
  const flows: WorkflowState[] = ["configuring", "ready", "closed"];
  for (const workflow of flows) for (const currency of currencies) for (const a of auths) for (const batch of batches) {
    const i: LayerInput = { workflow, provenance: "local-draft", currency, auth: a, batch };
    for (const layer of stateLayers(i)) assert.doesNotMatch(`${layer.value} ${layer.detail}`.replace("nothing is shown as settled or confirmed", ""), /\b(settled|confirmed)\b/i, JSON.stringify([i, layer.key]));
  }
});
test("state layers: an unreadable fact says so instead of guessing", () => {
  const l = stateLayers({ workflow: "configuring", provenance: "local-draft", currency: null, auth: null, batch: null });
  assert.equal(l[1]?.value, "Could not be read"); assert.equal(l[2]?.value, "Could not be read"); assert.equal(l[3]?.value, "Could not be read");
});

test("relevant sessions: what needs the user comes first, newest first within a group, and the list is limited", () => {
  const list = relevantSessions([
    bundle(1, { obligations: [ob()], authorization: auth("no-calculation") }),
    bundle(2, { obligations: [ob()], authorization: auth("awaiting-review", true) }),
    bundle(3, { obligations: [ob()], authorization: auth("stale") }),
    bundle(4, { obligations: [], authorization: auth("no-calculation") }),
    bundle(5, { obligations: [ob()], authorization: auth("approved") }),
    bundle(6, { workflow: "closed", obligations: [ob()], authorization: auth("approved") }),
  ], WHO, 4);
  assert.deepEqual(list.map((x) => x.label), ["S2", "S3", "S5", "S1"]);
  assert.equal(list[0]?.stage, "Awaiting your review"); assert.equal(list[0]?.tab, "approvals");
  assert.equal(list[1]?.tab, "netting");
});
test("relevant sessions: a session that could not be read is left out, never guessed", () => {
  assert.equal(relevantSessions([{ ...bundle(1), failed: true }], WHO).length, 0);
});
test("relevant sessions: stage wording depends on who the user is", () => {
  const b = bundle(1, { obligations: [ob()], authorization: auth("awaiting-review", false) });
  assert.equal(stageOf(b, { canDecide: true, canRecalculate: true }).stage, "Awaiting review", "the server says this user cannot decide");
  assert.equal(stageOf(bundle(1, { obligations: [ob()], authorization: auth("stale") }), { canDecide: false, canRecalculate: false }).tone, "progress");
});

test("activity entity links go to the section that holds the affected records", () => {
  assert.equal(entityOf("obligation.created", "s1").href, "/sessions/s1?tab=obligations");
  assert.equal(entityOf("netting.failed", "s1").tab, "netting");
  assert.equal(entityOf("authorization.rejected", "s1").tab, "approvals");
  assert.equal(entityOf("settlement.batch-prepared", "s1").tab, "settlement");
  assert.equal(entityOf("session.participant-added", "s1").tab, "participants");
  assert.equal(entityOf("session.recorded", "s1").href, "/sessions/s1");
  assert.equal(entityOf("something.unknown", "s1").href, "/sessions/s1");
});

test("obligation history states the change: previous and current state, and nothing for an unknown event", () => {
  assert.equal(transitionText(transitionOf("obligation.created")!), "Recorded as Active");
  assert.equal(transitionText(transitionOf("obligation.voided")!), "Active to Voided");
  assert.equal(transitionOf("obligation.updated"), null);
  assert.equal(transitionOf("session.recorded"), null);
});
