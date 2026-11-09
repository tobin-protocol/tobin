"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { can } from "../../lib/permissions/can.ts";
import { formatAmount, middle } from "../../lib/format.ts";
import { ASSET_CODE_PATTERN, fieldOfError, obligationForm, type FieldName, type ObligationForm } from "../../lib/obligations/rules.ts";
import { zodResolver } from "../../lib/schemas.ts";
import { client } from "../../lib/tobin/index.ts";
import type { SessionParticipantView } from "../../lib/tobin/types.ts";
import { useWorkspace } from "../shell/session.tsx";
import { reasonOf } from "../sessions/shared.tsx";
import { Button } from "../ui/Button.tsx";
import { InlineError } from "../ui/Feedback.tsx";
import { SelectField, TextField } from "../ui/Form.tsx";
import { Confirm as Dialog } from "../tobin/Overlays.tsx";
import { Card, Panel, StatGrid } from "../ui/Surfaces.tsx";

/**
 * The record-obligation flow, in the 420px action panel. Only the fields the backend accepts (debtor, creditor, amount, asset, reference). Debtor and creditor
 * are limited to the session's active participants; the asset is limited to the supported-asset list when the operator has configured one. The client
 * pre-checks what it can mirror; the server decides, and its message is shown under the field it concerns.
 */
export function RecordObligationPanel({ sessionId, participants, workflow, onRecorded }: {
  sessionId: string; participants: SessionParticipantView[]; workflow: "configuring" | "ready" | "closed"; onRecorded: () => Promise<unknown>;
}) {
  const { org, actor } = useWorkspace();
  const allowed = can(actor, "obligations.record");
  const editable = allowed.allowed && workflow === "configuring";
  const assets = useQuery({ queryKey: ["session", org.id, sessionId, "assets"], queryFn: () => client.assets.list(org.id, sessionId), retry: false, staleTime: 60_000 });
  const active = participants.filter((p) => p.status === "active");
  const [reviewing, setReviewing] = useState<ObligationForm | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const f = useForm<ObligationForm>({ resolver: zodResolver(obligationForm), defaultValues: { debtor: "", creditor: "", amount: "", asset: "", reference: "" } });
  const v = useWatch({ control: f.control }) as ObligationForm;

  if (!editable) {
    const why = !allowed.allowed ? `${allowed.reason}` : workflow === "ready" ? "The session is marked ready. Obligations can only change while it is being configured. An administrator can reopen it." : "A closed session cannot change.";
    return (
      <Panel className="space-y-3" aria-label="Record an obligation">
        <Card>
          <h2 className="text-entity font-medium">Record an obligation</h2>
          <p className="mt-2 text-body text-muted" role="note">{why}</p>
        </Card>
      </Panel>
    );
  }

  const supported = assets.data ?? [];
  const codeMode = !assets.isLoading && supported.length === 0;
  const nameOf = (id: string) => active.find((p) => p.userId === id)?.name ?? id;
  const assetCode = (id: string) => (codeMode ? id : supported.find((a) => a.id === id)?.code ?? id);

  const review = f.handleSubmit((values) => {
    setFormError(null);
    if (codeMode && !ASSET_CODE_PATTERN.test(values.asset)) { f.setError("asset", { message: "Use 1 to 12 upper-case letters or digits, for example USD." }); return; }
    setReviewing(values);
  });

  const record = async () => {
    if (!reviewing) return;
    setBusy(true);
    try {
      await client.obligations.record(org.id, sessionId, {
        debtor: reviewing.debtor, creditor: reviewing.creditor, amount: reviewing.amount.trim(),
        ...(codeMode ? { asset: reviewing.asset } : { assetRef: reviewing.asset }),
        ...(reviewing.reference.trim() ? { reference: reviewing.reference.trim() } : {}),
      });
      setReviewing(null); f.reset({ debtor: "", creditor: "", amount: "", asset: v.asset, reference: "" }); setDone(true);
      await onRecorded();
    } catch (e) {
      // the backend's own message, under the field it is about
      const message = reasonOf(e); const field: FieldName = fieldOfError(message);
      setReviewing(null);
      if (field === "form") setFormError(message); else f.setError(field, { message });
    } finally { setBusy(false); }
  };

  const err = f.formState.errors;
  return (
    <Panel className="space-y-3" aria-label="Record an obligation">
      <form noValidate onSubmit={(e) => { setDone(false); void review(e); }} className="space-y-3">
        <h2 className="px-1 text-entity font-medium">Record an obligation</h2>
        <SelectField id="ob-debtor" label="Debtor (owes)" error={err.debtor?.message} {...f.register("debtor")}>
          <option value="">Choose a participant</option>
          {active.map((p) => <option key={p.userId} value={p.userId}>{p.name}</option>)}
        </SelectField>
        <SelectField id="ob-creditor" label="Creditor (is owed)" error={err.creditor?.message} {...f.register("creditor")}>
          <option value="">Choose a participant</option>
          {active.map((p) => <option key={p.userId} value={p.userId}>{p.name}</option>)}
        </SelectField>
        <TextField id="ob-amount" label="Amount (base units)" inputMode="numeric" autoComplete="off" placeholder="100" hint="A whole number of base units. No decimals." error={err.amount?.message} {...f.register("amount")} />
        {codeMode ? (
          <TextField id="ob-asset" label="Asset code" autoComplete="off" placeholder="USD" maxLength={12} hint="No supported-asset list is configured, so a code is accepted and recorded as a code, not an asset identity." error={err.asset?.message} {...f.register("asset", { setValueAs: (x: string) => x.toUpperCase() })} />
        ) : (
          <SelectField id="ob-asset" label="Asset" disabled={assets.isLoading} error={err.asset?.message ?? (assets.error ? "The supported assets could not be loaded." : undefined)} {...f.register("asset")}>
            <option value="">{assets.isLoading ? "Loading assets" : "Choose a supported asset"}</option>
            {supported.map((a) => <option key={a.id} value={a.id}>{a.code} ({middle(a.id, 6, 4)})</option>)}
          </SelectField>
        )}
        <TextField id="ob-reference" label="Reference (optional)" autoComplete="off" maxLength={200} error={err.reference?.message} {...f.register("reference")} />
        {formError ? <InlineError>{formError}</InlineError> : null}
        {done ? <p role="status" className="px-1 text-body text-muted">Obligation recorded. The current calculation, if any, is now stale.</p> : null}
        <Button type="submit" variant="primary" size="lg" disabled={active.length < 2} aria-describedby={active.length < 2 ? "ob-need" : undefined}>Review obligation</Button>
        {active.length < 2 ? <p id="ob-need" className="px-1 text-body text-muted" role="note">Add at least two participants first. Debtor and creditor must be participants of this session.</p> : null}
      </form>

      <Dialog open={!!reviewing} onClose={() => setReviewing(null)} title="Record this obligation?" description="It is recorded in Tobin only. It invalidates the current calculation and any review of it." primary={{ label: "Record obligation", onClick: record, loading: busy }}>
        {reviewing ? (
          <div className="rounded-card bg-card p-4">
            <StatGrid columns={2} items={[
              { label: "Debtor", value: nameOf(reviewing.debtor) },
              { label: "Creditor", value: nameOf(reviewing.creditor) },
              { label: "Amount", value: formatAmount(reviewing.amount.trim(), assetCode(reviewing.asset)) },
              { label: "Asset", value: assetCode(reviewing.asset), hint: codeMode ? "Code only" : "Supported asset" },
              { label: "Reference", value: reviewing.reference.trim() || "No data" },
            ]} />
          </div>
        ) : null}
      </Dialog>
    </Panel>
  );
}
