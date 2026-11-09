import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { APPROVAL_NOTE, approvalNote, canSubmitReject, hasActiveApproval, rejectReasonError } from "../lib/approvals/rules.ts";
import { blocksApproval, diffSettlement, instructionNets } from "../lib/settlement/diff.ts";
import { BACKEND_RECORDS, isStopped, NO_AUTOMATIC_RETRY, stageText, stageView, STAGES } from "../lib/stages.ts";
import { failureOf } from "../lib/settlement/failure.ts";
import { FAILED_FIXTURES } from "../lib/fixtures/failed-states.ts";
import type { BatchView, CalculationView, DecisionView, InstructionView } from "../lib/tobin/types.ts";

const calc = (positions: [string, string][], over: Partial<NonNullable<CalculationView["calculation"]>> = {}): NonNullable<CalculationView["calculation"]> => ({
  id: "calc_1", asset: "USD", createdAt: "2026-01-01", createdBy: "Alice", gross: "250", obligationCount: 3,
  positions: positions.map(([userId, net]) => ({ userId, name: userId.toUpperCase(), net, role: BigInt(net) > 0n ? "debtor" : BigInt(net) < 0n ? "creditor" : "flat" })), ...over,
});
const ins = (seq: number, payer: string, payee: string, amount: string): InstructionView => ({ id: `i${seq}`, seq, payer, payerName: payer.toUpperCase(), payee, payeeName: payee.toUpperCase(), assetId: "testnet:USD:G", amount, fingerprint: null, network: "testnet" });
const batch = (instructions: InstructionView[], over: Partial<BatchView["batch"]> = {}, validation: BatchView["validation"] = []): Pick<BatchView, "batch" | "instructions" | "validation"> => ({
  batch: { id: "bat_1", attempt: 1, calculationId: "calc_1", asset: { id: "testnet:USD:G", network: "testnet", kind: "issued", code: "USD" }, instructionCount: instructions.length, totalAmount: instructions.reduce((t, i) => t + BigInt(i.amount), 0n).toString(), instructionsHash: "h", algorithm: "a", preparedBy: "Alice", preparedAt: "2026-01-01", ...over },
  instructions, validation,
});
const GOOD = [ins(1, "a", "b", "20"), ins(2, "a", "c", "10")];
const POS: [string, string][] = [["a", "30"], ["b", "-20"], ["c", "-10"]];

test("instruction nets: payers are positive, payees negative", () => {
  const n = instructionNets(GOOD);
  assert.equal(n.get("a"), 30n); assert.equal(n.get("b"), -20n); assert.equal(n.get("c"), -10n);
});

test("a prepared settlement that matches the approved result has no mismatch and does not block", () => {
  const d = diffSettlement(calc(POS), batch(GOOD));
  assert.equal(d.ok, true);
  assert.equal(blocksApproval(d), false);
});
test("MISMATCH BLOCKING: a changed amount blocks approval and names the participant", () => {
  const bad = [ins(1, "a", "b", "25"), ins(2, "a", "c", "10")];
  const d = diffSettlement(calc(POS), batch(bad));
  assert.equal(d.ok, false);
  assert.equal(blocksApproval(d), true);
  assert.ok(d.issues.some((i) => i.expected === "30" && i.actual === "35"), "the payer's net differs");
  assert.ok(d.issues.some((i) => /B:/.test(i.text)), "a participant is named");
});
test("MISMATCH BLOCKING: an extra or missing instruction, a different asset and a stale calculation all block", () => {
  assert.equal(blocksApproval(diffSettlement(calc(POS), batch([ins(1, "a", "b", "20")]))), true, "missing instruction");
  assert.equal(blocksApproval(diffSettlement(calc(POS), batch([...GOOD, ins(3, "b", "c", "1")]))), true, "extra instruction");
  assert.equal(blocksApproval(diffSettlement(calc(POS, { asset: "EUR" }), batch(GOOD))), true, "asset differs");
  assert.equal(blocksApproval(diffSettlement(calc(POS, { id: "calc_2" }), batch(GOOD))), true, "a newer calculation");
  assert.equal(blocksApproval(diffSettlement(calc(POS), batch(GOOD, { totalAmount: "31" }))), true, "total differs from the instructions");
  assert.equal(blocksApproval(diffSettlement(null, batch(GOOD))), true, "no calculation to compare with");
});
test("MISMATCH BLOCKING: a failing server check blocks, labelled as the server's", () => {
  const d = diffSettlement(calc(POS), batch(GOOD, {}, [{ key: "current", label: "The calculation is the latest and current", ok: false, detail: "a newer calculation exists" }]));
  assert.equal(blocksApproval(d), true);
  assert.equal(d.issues[0]?.source, "server");
});

test("REJECT REQUIRES A REASON: empty, blank, over 500 characters and markup are refused", () => {
  assert.match(rejectReasonError("") ?? "", /Give a reason/);
  assert.match(rejectReasonError("   ") ?? "", /Give a reason/);
  assert.match(rejectReasonError("x".repeat(501)) ?? "", /at most 500/);
  assert.notEqual(rejectReasonError("<b>"), null);
  assert.equal(rejectReasonError("Amounts do not match the invoices."), null);
  assert.equal(canSubmitReject(""), false);
  assert.equal(canSubmitReject("Wrong asset"), true);
});

const dec = (decision: "approved" | "rejected", status = "active"): DecisionView => ({ id: "d", decision, decidedBy: "Bob", decidedAt: "2026-01-01", status });
test("the approval note follows an approval and says it is not an on-chain signature", () => {
  assert.equal(approvalNote([]), null);
  assert.equal(approvalNote([dec("rejected")]), null);
  assert.equal(approvalNote([dec("approved")]), APPROVAL_NOTE);
  assert.match(APPROVAL_NOTE, /not an on-chain signature/);
  assert.equal(hasActiveApproval([dec("approved", "superseded")]), false);
  assert.equal(hasActiveApproval([dec("approved")]), true);
});

test("STAGE RAIL: the backend records only Prepared; the other stages are Not supported, never Not reached", () => {
  assert.deepEqual(STAGES.filter((s) => BACKEND_RECORDS[s]), ["prepared"]);
  const v = stageView({ state: "awaiting-signer", verifiedReadBack: false });
  assert.equal(stageText("prepared", v.stages[0]!.reached), "Reached");
  for (const s of STAGES.slice(1)) assert.equal(stageText(s, false), "Not supported");
});
test("STAGE RAIL never reaches the final stage from anything the backend can report", () => {
  const all = ["awaiting-signer", "signing", "signed", "submission-pending", "submitted", "confirmed", "reconciled", "failed", "expired", "unknown-outcome", "reconciliation-required"] as const;
  for (const state of all) {
    const v = stageView({ state, verifiedReadBack: false });
    assert.equal(v.stages[3]?.reached, false, `${state} without a verified read-back`);
    assert.notEqual(v.current, STAGES[3]);
  }
});
test("failed states say there is no automatic retry", () => {
  assert.equal(isStopped("failed"), true);
  assert.equal(isStopped("unknown-outcome"), true);
  assert.equal(isStopped("awaiting-signer"), false);
  assert.equal(NO_AUTOMATIC_RETRY, "No automatic retry.");
});

test("APPROVAL / SIGNATURE SEPARATION: the approval block has no signing control and the signature block no approval control", () => {
  const src = readFileSync(new URL("../components/ui/Flow.tsx", import.meta.url), "utf8");
  const section = (name: string): string => { const i = src.indexOf(`export function ${name}`); assert.ok(i >= 0, name); const j = src.indexOf("\nexport ", i + 10); return src.slice(i, j < 0 ? undefined : j); };
  const approval = section("ApprovalBlock"); const signature = section("SignatureBlock");
  assert.doesNotMatch(approval, /Sign with wallet|SignatureBlock|signingSupported/);
  assert.doesNotMatch(signature, /bApproveb|onApprove|onReject|ApprovalBlock/);
  assert.match(signature, /Not supported/);
  assert.match(signature, /bg-card/, "the signature block is the same white card surface as the approval block");
  assert.match(approval, /bg-card/, "the approval block is a white card");
  assert.match(signature, /data-icon="key"/, "told apart by a key icon");
  assert.match(signature, /Wallet signatures/, "and by its title");
  assert.doesNotMatch(signature, /bg-panel/, "no separate colour");
});
test("APPROVAL / SIGNATURE SEPARATION: they never share a step, a row or a button group in the close-out", () => {
  // the approval block is rendered in steps 1 and 3 (ApprovalsTab, BatchStep); the signature block only in step 5 (SignStep)
  const steps = readFileSync(new URL("../components/settlement/Steps.tsx", import.meta.url), "utf8");
  const sign = steps.slice(steps.indexOf("export function SignStep"));
  assert.match(sign, /<SignatureBlock/);
  assert.doesNotMatch(sign, /<ApprovalBlock|<Button|<ButtonLink/, "no approval and no action joins the signature block");
  const tab = readFileSync(new URL("../components/approvals/ApprovalsTab.tsx", import.meta.url), "utf8");
  assert.match(tab, /<ApprovalBlock/);
  assert.doesNotMatch(tab, /<SignatureBlock/);
});

test("FAILED STATES: failed, expired and unknown-outcome show the recorded reason, the time and no automatic retry", () => {
  for (const fx of FAILED_FIXTURES) {
    const f = failureOf(fx.state, fx.events);
    assert.ok(f, fx.state);
    assert.equal(f.detail, fx.events[0]!.detail);
    assert.equal(f.at, fx.events[0]!.at);
    assert.ok(f.notes.includes(NO_AUTOMATIC_RETRY), "states that nothing retries by itself");
    assert.ok(f.notes.some((n) => /separate action by an administrator/.test(n)), "any retry is a separate action");
  }
});
test("FAILED STATES: only a stopped state produces a failure, and the last event is the one shown", () => {
  for (const s of ["awaiting-signer", "signing", "signed", "submitted", "reconciled"] as const) assert.equal(failureOf(s, [{ detail: "x", at: "t" }]), null, s);
  assert.equal(failureOf(undefined, []), null);
  const f = failureOf("failed", [{ detail: "first", at: "t1" }, { detail: "last", at: "t2" }]);
  assert.equal(f?.detail, "last");
  assert.equal(failureOf("failed", [])?.detail, "No data", "no invented reason when none is recorded");
});
test("FAILED STATES: an unknown outcome is neither a failure nor a success", () => {
  const f = failureOf("unknown-outcome", FAILED_FIXTURES[2]!.events);
  assert.match(f!.notes.join(" "), /neither|not treated as a failure and not as a success/);
});
test("FAILED STATES: fixtures are labelled FIXTURE and no real screen imports them", () => {
  assert.ok(FAILED_FIXTURES.every((x) => x.events.every((e) => e.detail.startsWith("FIXTURE"))));
  for (const dir of ["../app", "../components"]) {
    const walk = (p: string): string[] => readdirSync(p, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(p + "/" + e.name) : [p + "/" + e.name]));
    for (const file of walk(new URL(dir, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")).filter((p) => /\.tsx?$/.test(p))) {
      if (/app[\\/]dev[\\/]components/.test(file)) continue;
      assert.doesNotMatch(readFileSync(file, "utf8"), /fixtures\/failed-states/, file);
    }
  }
});
