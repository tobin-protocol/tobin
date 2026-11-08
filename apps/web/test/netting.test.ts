import assert from "node:assert/strict";
import test from "node:test";
import { formatAmount } from "../lib/format.ts";
import { deriveGlobalObligations } from "../lib/derived/obligations.ts";
import { absAmount, eligibility, groupPositions, grossVsNet, splitByAsset, totalsByAsset } from "../lib/netting/group.ts";
import { fieldOfError, historyOf, obligationForm } from "../lib/obligations/rules.ts";
import type { CalculationPosition, ObligationView, SessionRow } from "../lib/tobin/types.ts";

const pos = (userId: string, net: string): CalculationPosition => ({ userId, name: userId, net, role: BigInt(net) > 0n ? "debtor" : BigInt(net) < 0n ? "creditor" : "flat" });
const ob = (id: string, asset: string, amount: string, over: Partial<ObligationView> = {}): ObligationView => ({ id, debtor: "a", debtorName: "A", creditor: "b", creditorName: "B", amount, asset, status: "active", revision: 1, createdAt: "2026-01-01T00:00:00.000Z", ...over });

test("positions group as net debtors, net creditors, then zero, largest first, stable on ties", () => {
  const g = groupPositions([pos("zed", "0"), pos("c", "-10"), pos("a", "30"), pos("b", "-20"), pos("d", "30"), pos("e", "5")]);
  assert.deepEqual(g.debtors.map((p) => p.userId), ["a", "d", "e"]);
  assert.deepEqual(g.creditors.map((p) => p.userId), ["b", "c"]);
  assert.deepEqual(g.zero.map((p) => p.userId), ["zed"]);
  assert.equal(absAmount("-20"), "20");
});
test("grouping does not lose or add a participant", () => {
  const all = [pos("a", "30"), pos("b", "-20"), pos("c", "-10"), pos("d", "0")];
  const g = groupPositions(all);
  assert.equal(g.debtors.length + g.creditors.length + g.zero.length, all.length);
});

test("assets are never mixed: one section per asset, and totals are per asset", () => {
  const list = [ob("1", "USD", "100"), ob("2", "EUR", "5"), ob("3", "USD", "50"), ob("4", "EUR", "7", { status: "voided" })];
  const sections = splitByAsset(list);
  assert.deepEqual(sections.map((s) => [s.asset, s.items.length]), [["EUR", 2], ["USD", 2]]);
  const totals = totalsByAsset(list);
  assert.deepEqual(totals.map((t) => [t.asset, t.total]), [["EUR", "5"], ["USD", "150"]]);
  assert.equal(totals.length, 2, "no combined total exists");
});
test("totals use BigInt and do not lose precision on large amounts", () => {
  const big = "170141183460469231731687303715884105727";
  assert.equal(totalsByAsset([ob("1", "USD", big), ob("2", "USD", "1")])[0]?.total, "170141183460469231731687303715884105728");
});

test("the amount-with-asset rule: a label never shows a bare number", () => {
  assert.equal(formatAmount("1000", "USD"), "1,000 USD");
  assert.match(formatAmount("1000", ""), /\(no asset\)/);
  assert.match(formatAmount("1000", null), /\(no asset\)/);
  assert.equal(formatAmount(null, "USD"), "No data");
  for (const t of totalsByAsset([ob("1", "USD", "250"), ob("2", "EUR", "40")])) assert.match(t.label, /[A-Z]{3}$/);
});

test("gross versus net: net is what moves; the reduction is shown only when current", () => {
  const p = [pos("a", "30"), pos("b", "-20"), pos("c", "-10")];
  assert.deepEqual(grossVsNet("250", p, true), { gross: "250", net: "30", reduction: "220" });
  assert.equal(grossVsNet("250", p, false).reduction, null);
  assert.equal(grossVsNet("20", p, true).reduction, null, "net above gross is never reported as a reduction");
});

test("eligibility: voided obligations are excluded with a reason; an inactive participant blocks", () => {
  const active = new Set(["a", "b"]);
  const r = eligibility([ob("1", "USD", "1"), ob("2", "USD", "2", { status: "voided" }), ob("3", "USD", "3", { creditor: "zz" })], active);
  assert.deepEqual(r.eligible.map((o) => o.id), ["1"]);
  assert.deepEqual(r.excluded.map((e) => [e.obligation.id, e.reason]), [["2", "voided"], ["3", "inactive-participant"]]);
  assert.ok(r.excluded.every((e) => e.text.length > 10));
});

test("validation messages from the backend land under the right field", () => {
  assert.equal(fieldOfError("the debtor must be an active participant of this session"), "debtor");
  assert.equal(fieldOfError("the creditor must be an active participant of this session"), "creditor");
  assert.equal(fieldOfError("debtor and creditor must be different participants"), "creditor");
  assert.equal(fieldOfError("amount must be a positive whole number of base units, written as digits only (no decimals, signs or spaces)"), "amount");
  assert.equal(fieldOfError("amount is above the supported maximum"), "amount");
  assert.equal(fieldOfError("choose a supported asset identity: an asset code alone does not identify an asset"), "asset");
  assert.equal(fieldOfError("this session nets USD: obligations in different assets are never netted together"), "asset");
  assert.equal(fieldOfError("reference must be 0 to 200 printable characters without < or >"), "reference");
  assert.equal(fieldOfError("the session is marked ready: reopen it to make changes"), "form");
});
test("the client form mirrors the amount rule", () => {
  const ok = { debtor: "a", creditor: "b", amount: "100", asset: "USD", reference: "" };
  assert.equal(obligationForm.safeParse(ok).success, true);
  for (const amount of ["0", "01", "1.5", "-3", "1e3", " ", "", "1".repeat(40)]) assert.equal(obligationForm.safeParse({ ...ok, amount }).success, false, amount);
  assert.equal(obligationForm.safeParse({ ...ok, creditor: "a" }).success, false);
});

test("history picks only this obligation's events, oldest first", () => {
  const id = "a87ea6e7ffff";
  const h = historyOf(id, [
    { at: "2026-01-02", kind: "obligation.voided", actor: "A", detail: "obligation a87ea6e7 voided" },
    { at: "2026-01-01", kind: "obligation.created", actor: "A", detail: "obligation a87ea6e7: x owes y" },
    { at: "2026-01-01", kind: "obligation.created", actor: "A", detail: "obligation 11111111: other" },
    { at: "2026-01-01", kind: "session.recorded", actor: "A", detail: "obligation a87ea6e7" },
  ]);
  assert.deepEqual(h.map((x) => x.kind), ["obligation.created", "obligation.voided"]);
});

test("global obligations: capped, labelled, per-asset totals, unreadable sessions reported", () => {
  const row = (i: number): SessionRow => ({ sessionId: `s${i}`, shortId: "x", label: `S${i}`, status: "", participants: "", createdAt: "2026-01-01", provenance: "local-draft", provenanceLabel: "", activityCount: 0, lastActivity: null });
  const rows = Array.from({ length: 12 }, (_, i) => row(i));
  const reads = [
    { row: rows[0]!, obligations: [ob("1", "USD", "10")], failed: false },
    { row: rows[1]!, obligations: [ob("2", "EUR", "3")], failed: false },
    { row: rows[2]!, failed: true },
  ];
  const g = deriveGlobalObligations(rows, reads);
  assert.equal(g.capped, true);
  assert.equal(g.sessionsTotal, 12);
  assert.equal(g.sessionsRead, 2);
  assert.equal(g.unreadable, 1);
  assert.deepEqual(g.totals.map((t) => t.asset), ["EUR", "USD"]);
  assert.equal(g.items[0]?.sessionLabel !== undefined, true);
});
