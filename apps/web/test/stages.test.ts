import assert from "node:assert/strict";
import { test } from "node:test";
import { stageView, STAGES, type ExecState } from "../lib/stages.ts";

const ALL: ExecState[] = ["awaiting-signer", "signing", "signed", "submission-pending", "submitted", "confirmed", "reconciled", "failed", "expired", "unknown-outcome", "reconciliation-required"];

test("Confirmed is never reached without a verified read-back, whatever the backend state says", () => {
  for (const state of ALL) {
    const v = stageView({ state, verifiedReadBack: false });
    assert.notEqual(v.current, "confirmed", `${state} without read-back must not be Confirmed`);
    assert.equal(v.stages.find((s) => s.stage === "confirmed")?.reached, false, state);
  }
});

test("a backend 'confirmed' state without the flag reads 'Submitted, awaiting verification'", () => {
  const v = stageView({ state: "confirmed", verifiedReadBack: false });
  assert.equal(v.headline, "Submitted, awaiting verification");
  assert.equal(v.current, "submitted");
});

test("Confirmed requires BOTH a confirmed backend state and the verified flag", () => {
  assert.equal(stageView({ state: "confirmed", verifiedReadBack: true }).current, "confirmed");
  assert.equal(stageView({ state: "reconciled", verifiedReadBack: true }).current, "confirmed");
  // the flag alone does not confirm a transaction that was only submitted or signed
  assert.equal(stageView({ state: "submitted", verifiedReadBack: true }).current, "submitted");
  assert.equal(stageView({ state: "signed", verifiedReadBack: true }).current, "signed");
});

test("only the stages actually reached are filled, and Submitted never implies Confirmed", () => {
  const v = stageView({ state: "submitted", verifiedReadBack: false });
  assert.deepEqual(v.stages.map((s) => s.reached), [true, true, true, false]);
  assert.deepEqual(stageView({ state: "awaiting-signer", verifiedReadBack: false }).stages.map((s) => s.reached), [true, false, false, false]);
  assert.equal(stageView({ state: undefined, verifiedReadBack: false }).stages.every((s) => !s.reached), true);
  assert.equal(STAGES.length, 4);
});

test("failure stops at the stage reached and never reads as success", () => {
  const f = stageView({ state: "failed", verifiedReadBack: true });
  assert.equal(f.failedAt, "prepared");
  assert.notEqual(f.current, "confirmed");
  assert.equal(stageView({ state: "unknown-outcome", verifiedReadBack: false }).failedAt, "submitted");
});
