import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { splitByAsset, totalsByAsset } from "../lib/netting/group.ts";
import { voidGate } from "../lib/obligations/rules.ts";
import { KIND_LABEL, REOPEN_CONSEQUENCES } from "../lib/sessions/reopen.ts";
import { workflowActions } from "../lib/sessions/workflow-actions.ts";
import { batchApprovalBlocked, closeOutOf, STEP_ACTIONS, STEP_ORDER } from "../lib/settlement/closeout.ts";
import type { ReadinessCheck } from "../lib/tobin/types.ts";

const root = join(import.meta.dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
const admin = { role: "admin", reviewer: false } as const;
const member = { role: "member", reviewer: true } as const;
const ok: ReadinessCheck[] = [{ key: "state", label: "The session is being configured", ok: true, fix: "" }];

// ---- Reopen ----
test("Reopen is offered for a ready session to an administrator, and explains itself otherwise", () => {
  assert.equal(workflowActions({ workflow: "ready", checks: ok, batch: "none", actor: admin, reviewed: true }).reopen.enabled, true);
  const asMember = workflowActions({ workflow: "ready", checks: ok, batch: "none", actor: member, reviewed: true }).reopen;
  assert.equal(asMember.enabled, false);
  assert.match(asMember.reason ?? "", /administrator/i);
  assert.match(workflowActions({ workflow: "configuring", checks: ok, batch: "none", actor: admin, reviewed: true }).reopen.reason ?? "", /already being configured/);
  assert.match(workflowActions({ workflow: "closed", checks: ok, batch: "approved", actor: admin, reviewed: true }).reopen.reason ?? "", /cannot be reopened/);
});

test("the Reopen consequences say what the service really does", () => {
  const all = REOPEN_CONSEQUENCES.map((c) => c.text).join(" ");
  assert.match(all, /Being configured/);
  assert.match(all, /deletes nothing/);
  assert.match(all, /review decision/);
  assert.match(all, /calculation stale/);
  assert.match(all, /prepared settlement/);
  assert.match(all, /No longer applies/);
  for (const k of ["changes", "kept", "stale"] as const) { assert.ok(REOPEN_CONSEQUENCES.some((c) => c.kind === k), k); assert.ok(KIND_LABEL[k]); }
});

test("the Reopen wording is checked against the console's service code", () => {
  const svc = read("../web-console/lib/registry/service.ts");
  const start = svc.indexOf("  reopenSession(");
  const line = svc.slice(start, svc.indexOf("\n", start));
  assert.match(line, /#need\(orgId, u, true\)/, "administrator only");
  assert.match(line, /#move\(u, orgId, sessionId, 'configuring'\)/, "it only moves the workflow state");
  assert.doesNotMatch(line, /#invalidate|putDecision|putCalculation|putBatch/, "reopening itself invalidates nothing and deletes nothing");
  const clearing = read("../web-console/lib/registry/clearing.ts");
  assert.match(clearing, /ready: \['configuring', 'closed'\]/, "ready is the only state that can go back to configuring");
  assert.match(clearing, /closed: \[\]/, "a closed session cannot be reopened");
  const editable = svc.slice(svc.indexOf("  #editable("), svc.indexOf("  #activeParticipant("));
  assert.match(editable, /w !== 'configuring'/, "edits need the configuring state");
  // the first edit after a reopen invalidates reviews: participants, obligations and netting all call #invalidate inside their own transaction
  for (const fn of ["addSessionParticipant(", "removeSessionParticipant(", "createObligation(", "voidObligation(", "calculate("]) {
    const i = svc.indexOf("  " + fn);
    assert.ok(i >= 0, fn);
    const body = svc.slice(i, i + 3800);
    assert.match(body, /#editable|#invalidate/, fn + " is guarded and invalidates");
  }
});

// ---- Void ----
test("Void is for an administrator, an active obligation and a session being configured", () => {
  const base = { adminAllowed: true, adminReason: null, workflow: "configuring", status: "active" } as const;
  assert.deepEqual(voidGate(base), { allowed: true, reason: null });
  assert.match(voidGate({ ...base, status: "voided" }).reason ?? "", /already voided/);
  assert.match(voidGate({ ...base, adminAllowed: false, adminReason: "Only administrators can do this." }).reason ?? "", /Only administrators/);
  const ready = voidGate({ ...base, workflow: "ready" });
  assert.equal(ready.allowed, false);
  assert.match(ready.reason ?? "", /An administrator can reopen it/);
  assert.match(voidGate({ ...base, workflow: "closed" }).reason ?? "", /closed session cannot change/);
});

test("the obligation detail offers no edit and no delete, and void is its own confirmed action", () => {
  const src = read("components/obligations/ObligationsTab.tsx");
  assert.doesNotMatch(src, /Edit obligation|client\.obligations\.(update|delete|edit)/);
  assert.match(src, /Void obligation/);
  assert.match(src, /client\.obligations\.void\(/);
  assert.match(src, /history entry/);
});

// ---- per-asset grouping ----
test("totals and positions are per asset and never added across assets", () => {
  const ob = [
    { asset: "USD", amount: "100", status: "active" as const }, { asset: "USD", amount: "50", status: "active" as const },
    { asset: "EUR", amount: "7", status: "active" as const }, { asset: "USD", amount: "999", status: "voided" as const },
  ];
  const t = totalsByAsset(ob);
  assert.deepEqual(t.map((x) => [x.asset, x.total]), [["EUR", "7"], ["USD", "150"]]);
  assert.equal(t.length, 2, "two lines, no combined total");
  const s = splitByAsset([{ asset: "USD", positions: [] }, { asset: "EUR", positions: [] }, { asset: "USD", positions: [] }]);
  assert.deepEqual(s.map((x) => [x.asset, x.items.length]), [["EUR", 1], ["USD", 2]]);
});

// ---- the close-out ----
test("the close-out walks five numbered steps in order", () => {
  assert.deepEqual([...STEP_ORDER], ["review", "prepare", "batch", "execution", "sign"]);
  const { steps } = closeOutOf({ closed: false, auth: "awaiting-review", batch: "none", mismatch: null });
  assert.deepEqual(steps.map((s) => s.number), [1, 2, 3, 4, 5]);
  assert.deepEqual(steps.map((s) => s.label), ["Review calculation", "Prepare settlement", "Review settlement", "Execution record", "Sign, submit, verify"]);
});

test("the current step follows the facts", () => {
  const at = (f: Parameters<typeof closeOutOf>[0]) => closeOutOf(f).current;
  assert.equal(at({ closed: false, auth: "awaiting-review", batch: "none", mismatch: null }), "review");
  assert.equal(at({ closed: false, auth: "approved", batch: "none", mismatch: null }), "prepare");
  assert.equal(at({ closed: false, auth: "approved", batch: "rejected", mismatch: null }), "prepare", "a rejected settlement is prepared again");
  assert.equal(at({ closed: false, auth: "approved", batch: "superseded", mismatch: null }), "prepare");
  assert.equal(at({ closed: false, auth: "approved", batch: "awaiting-review", mismatch: false }), "batch");
  assert.equal(at({ closed: false, auth: "approved", batch: "approved", mismatch: null }), null, "nothing more to do in this app");
  assert.equal(at({ closed: false, auth: "rejected", batch: "none", mismatch: null }), null);
  assert.equal(at({ closed: true, auth: "approved", batch: "approved", mismatch: null }), null);
});

test("a fact that could not be read stops the walk instead of counting as done", () => {
  const a = closeOutOf({ closed: false, auth: null, batch: "approved", mismatch: null });
  assert.equal(a.steps[0]!.state, "unread");
  assert.ok(a.steps.slice(1, 4).every((s) => s.state === "upcoming"), "nothing after it is marked done");
  assert.equal(a.current, null);
  const b = closeOutOf({ closed: false, auth: "approved", batch: null, mismatch: null });
  assert.equal(b.steps[0]!.state, "done");
  assert.equal(b.steps[1]!.state, "unread");
  assert.equal(b.steps[2]!.state, "upcoming");
});

test("sign, submit and verify are never anything but Not supported; the execution record is read-only", () => {
  for (const f of [{ closed: false, auth: "awaiting-review", batch: "none", mismatch: null }, { closed: false, auth: "approved", batch: "approved", mismatch: false }, { closed: true, auth: "approved", batch: "approved", mismatch: null }] as const) {
    const { steps } = closeOutOf(f);
    assert.equal(steps[4]!.state, "unsupported");
    assert.match(steps[4]!.note, /cannot sign, submit or verify/);
  }
  const { steps } = closeOutOf({ closed: false, auth: "approved", batch: "approved", mismatch: false });
  assert.equal(steps[3]!.state, "readonly");
  assert.deepEqual(STEP_ACTIONS.execution, []);
  assert.deepEqual(STEP_ACTIONS.sign, []);
});

test("a mismatch between the approved result and the prepared settlement blocks the review step, but a reviewer can still reject", () => {
  const { steps, current } = closeOutOf({ closed: false, auth: "approved", batch: "awaiting-review", mismatch: true });
  assert.equal(steps[2]!.state, "blocked");
  assert.match(steps[2]!.note, /Approval is blocked/);
  assert.equal(current, "batch", "the step is still where the work is, so a rejection stays possible");
  assert.equal(batchApprovalBlocked(true), true);
  assert.equal(batchApprovalBlocked(false), false);
  assert.equal(batchApprovalBlocked(null), false);
  assert.ok(STEP_ACTIONS.batch.some((a) => a.id === "reject-settlement"));
  const panel = read("components/settlement/SettlementPanel.tsx");
  assert.match(panel, /canReject = !!b && decideRole\.allowed && b\.eligibility\.canDecide;/, "reject is not gated on the diff");
  assert.match(panel, /canApprove = !!b && decideRole\.allowed && b\.eligibility\.canDecide && !blocked;/, "approve is");
});

test("every action has exactly one confirmation, and a rejection collects its reason inside it", () => {
  for (const [step, actions] of Object.entries(STEP_ACTIONS)) for (const a of actions) assert.equal(a.confirms, 1, `${step}/${a.id}`);
  for (const id of ["reject-calculation", "reject-settlement"]) {
    const a = Object.values(STEP_ACTIONS).flat().find((x) => x.id === id)!;
    assert.equal(a.needsReason, true, id);
    assert.equal(a.confirms, 1, "the reason is in the same dialog, not a second one");
  }
  // the panels open one dialog per action and never chain a second dialog from a first one
  for (const f of ["components/settlement/SettlementPanel.tsx", "components/approvals/ReviewPanel.tsx"]) {
    const src = read(f);
    assert.doesNotMatch(src, /setDialog\("(approve|reject|prepare)"\);[^}]*setDialog\("(approve|reject|prepare)"\)/, f + " chains dialogs");
    assert.match(src, /const close = \(\) => \{ setDialog\(null\)/, f);
  }
});

// ---- approval is not a signature ----
test("the approval block and the signature block are separate: different titles and icons, never in the same step", () => {
  const flow = read("components/ui/Flow.tsx");
  assert.match(flow, /Review decision/);
  assert.match(flow, /Wallet signatures/);
  assert.match(flow, /data-icon="check"/);
  assert.match(flow, /data-icon="key"/);
  const steps = read("components/settlement/Steps.tsx");
  const sign = steps.slice(steps.indexOf("export function SignStep"));
  const batch = steps.slice(steps.indexOf("export function BatchStep"), steps.indexOf("export function ExecutionStep"));
  assert.match(sign, /<SignatureBlock/);
  assert.doesNotMatch(sign, /<ApprovalBlock/);
  assert.match(batch, /<ApprovalBlock/);
  assert.doesNotMatch(batch, /<SignatureBlock/);
  assert.doesNotMatch(read("components/approvals/ApprovalsTab.tsx"), /<SignatureBlock/);
  assert.match(batch, /Approval recorded in Tobin\. This is not an on-chain signature\./);
  assert.match(read("lib/approvals/rules.ts"), /Approval recorded in Tobin\. This is not an on-chain signature\./);
});

test("the stage rail is shown once (in the session summary) and the Settlement tab has no duplicate list", () => {
  for (const f of ["components/settlement/Steps.tsx", "components/settlement/CloseOut.tsx", "components/approvals/ApprovalsTab.tsx", "components/settlement/SettlementPanel.tsx"]) assert.doesNotMatch(read(f), /StageRail|Transaction stages/, f);
  assert.match(read("components/sessions/SessionSummary.tsx"), /<StageRail/);
});

test("?tab=approvals redirects to the Settlement close-out", () => {
  const ws = read("components/sessions/Workspace.tsx");
  assert.match(ws, /raw === "approvals"\) router\.replace\(`\/sessions\/\$\{sessionId\}\?tab=settlement&step=review`\)/);
});

// ---- Activity is one shared component ----
test("the Activity list is one shared component for the session tab and the organization page", () => {
  assert.match(read("components/sessions/tabs.tsx"), /<ActivityView/);
  assert.match(read("components/activity/GlobalActivity.tsx"), /<ActivityView/);
  const view = read("components/activity/ActivityView.tsx");
  assert.match(view, /Event type/);
  assert.match(view, /From \(UTC\)/);
  assert.match(view, /label="Result"/);
  assert.doesNotMatch(view, /client\./, "read-only: it calls nothing");
});
