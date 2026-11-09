"use client";

import { useState, type ReactNode } from "react";
import { Button as KitButton } from "@/components/kit/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/kit/dialog";
import { roleLabels, type Actor } from "../../lib/permissions/can.ts";
import type { NextAction as NextActionData, TabKey } from "../../lib/sessions/next-action.ts";
import { workflowActions, type WorkflowAction } from "../../lib/sessions/workflow-actions.ts";
import { client } from "../../lib/tobin/index.ts";
import type { BatchStatus, ReadinessCheck, WorkflowState } from "../../lib/tobin/types.ts";
import { useWorkspace } from "../shell/session.tsx";
import { ButtonLink } from "../ui/Button.tsx";
import { InlineError } from "../ui/Feedback.tsx";
import { NextAction as NextActionCard } from "../ui/Flow.tsx";
import { Card, Panel } from "../ui/Surfaces.tsx";
import { reasonOf } from "./shared.tsx";

type Kind = "ready" | "close";
const COPY: Record<Kind, { button: string; title: string; description: ReactNode; confirm: string }> = {
  ready: {
    button: "Mark ready", title: "Mark this session ready?", confirm: "Mark ready",
    description: (
      <>
        <span className="block">Every readiness check passes. Marking it ready records that the application records are consistent.</span>
        <span className="mt-2 block">After this, participants and obligations can no longer be changed in this session, and this app cannot reopen it. Ready is not approval, signing or settlement.</span>
      </>
    ),
  },
  close: {
    button: "Close session", title: "Close this session?", confirm: "Close session",
    description: (
      <>
        <span className="block">An approved settlement exists for the current calculation, so the session can be closed.</span>
        <span className="mt-2 block">A closed session cannot change and cannot be reopened here. This is an operational closure: it does not mean anything settled. Nothing has moved on any network.</span>
      </>
    ),
  },
};

/** One confirmed dialog per consequential action. The server decides; its reason is shown in the dialog if it refuses. */
function ConfirmDialog({ kind, onClose, onConfirmed, sessionId }: { kind: Kind | null; onClose: () => void; onConfirmed: () => Promise<unknown>; sessionId: string }) {
  const { org } = useWorkspace();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const c = kind ? COPY[kind] : null;
  const run = async () => {
    if (!kind) return;
    setBusy(true); setError(null);
    try {
      if (kind === "ready") await client.sessions.markReady(org.id, sessionId); else await client.sessions.close(org.id, sessionId);
      await onConfirmed();
      onClose();
    } catch (e) { setError(reasonOf(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog open={!!kind} onOpenChange={(o) => { if (!o && !busy) { setError(null); onClose(); } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{c?.title}</DialogTitle>
          <DialogDescription asChild><div>{c?.description}</div></DialogDescription>
        </DialogHeader>
        {error ? <InlineError>{error}</InlineError> : null}
        <DialogFooter>
          <KitButton variant="outline" onClick={() => { setError(null); onClose(); }} disabled={busy}>Cancel</KitButton>
          <KitButton onClick={run} disabled={busy}>{busy ? "Working" : c?.confirm}</KitButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The session action panel for tabs without a panel of their own. It always shows exactly one primary button, or the reason there is none. The primary is,
 * in order: Close session (when it can be done), Mark ready (when it can be done), otherwise the next step of the lifecycle. Mark ready and Close session
 * are always listed below with their state and, when unavailable, the reason in words.
 */
export function SessionActionPanel({ sessionId, workflow, checks, batch, next, href, onReload, onChanged, actor, reviewed }: {
  sessionId: string; workflow: WorkflowState; checks: readonly ReadinessCheck[] | null; batch: BatchStatus | "none" | null; next: NextActionData; reviewed: boolean;
  href: (k: TabKey) => string; onReload: () => void; onChanged: () => Promise<unknown>; actor: Actor;
}) {
  const [confirm, setConfirm] = useState<Kind | null>(null);
  const wf = workflowActions({ workflow, checks, batch, actor, reviewed });
  const nextPrimary = next.primary;

  let primary: ReactNode;
  if (wf.primary === "close") primary = <KitButton size="lg" className="w-full" onClick={() => setConfirm("close")}>Close session</KitButton>;
  else if (wf.primary === "ready") primary = <KitButton size="lg" className="w-full" onClick={() => setConfirm("ready")}>Mark ready</KitButton>;
  else if (nextPrimary && !nextPrimary.blockedBy) primary = nextPrimary.label === "Reload" ? <KitButton size="lg" className="w-full" onClick={onReload}>Reload</KitButton> : <ButtonLink href={href(nextPrimary.tab)} variant="primary" size="lg" className="w-full">{nextPrimary.label}</ButtonLink>;
  else if (nextPrimary) primary = <div className="space-y-2"><KitButton size="lg" className="w-full" disabled aria-describedby="action-reason">{nextPrimary.label}</KitButton><p id="action-reason" className="text-body text-muted" role="note">{nextPrimary.blockedBy}</p></div>;
  else primary = <p className="text-body text-muted" role="note">{next.reason}</p>;

  const row = (kind: Kind, a: WorkflowAction, isPrimary: boolean) => (
    <li key={kind} className="py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-body font-medium">{COPY[kind].button}</span>
        {isPrimary ? <span className="text-label text-muted">Available above</span> : <KitButton variant="outline" size="sm" disabled={!a.enabled} aria-describedby={`${kind}-reason`} onClick={() => setConfirm(kind)}>{COPY[kind].button}</KitButton>}
      </div>
      <p id={`${kind}-reason`} className="mt-1 text-label text-muted">{a.enabled ? (kind === "ready" ? (reviewed ? "Every readiness check passes." : "Every readiness check passes. The console allows this before the calculation is reviewed; review it first unless you mean to skip that.") : "An approved settlement exists for the current calculation.") : a.reason}</p>
    </li>
  );

  // the card names what the primary button does; when the primary is a workflow action, the lifecycle's own next step is offered as a link beneath it
  const title = wf.primary === "close" ? "Close the session" : wf.primary === "ready" ? "Mark the session ready" : next.title;
  const who = wf.primary ? "An administrator" : next.who;
  const forYou = wf.primary ? true : next.forYou;
  const alsoNext = wf.primary && nextPrimary && !nextPrimary.blockedBy && nextPrimary.label !== "Reload" ? <p className="mt-3 text-label text-muted">Or continue the lifecycle: <a href={href(nextPrimary.tab)} className="inline-flex min-h-11 items-center underline underline-offset-4">{nextPrimary.label}</a></p> : null;
  return (
    <Panel className="space-y-4" aria-label="Session actions">
      <NextActionCard title={title} who={who} forYou={forYou}>{primary}{alsoNext}</NextActionCard>
      <Card>
        <h2 className="text-label uppercase tracking-wide text-muted">Session workflow</h2>
        <ul className="mt-1 divide-y divide-divider" aria-label="Session workflow actions">
          {row("ready", wf.markReady, wf.primary === "ready")}
          {row("close", wf.close, wf.primary === "close")}
        </ul>
      </Card>
      <Card>
        <p className="text-label uppercase tracking-wide text-muted">Your access</p>
        <p className="mt-1 text-body font-medium">{roleLabels(actor).join(", ")}</p>
        <p className="mt-1 text-label text-muted">This panel shows what you can do. The server makes the final decision and always wins. Approval in Tobin is not a Stellar signature.</p>
      </Card>
      <ConfirmDialog kind={confirm} onClose={() => setConfirm(null)} onConfirmed={onChanged} sessionId={sessionId} />
    </Panel>
  );
}

/** The same Mark ready and Close session controls, for tabs whose own panel owns the primary button (secondary buttons only). */
export function WorkflowCard({ sessionId, workflow, checks, batch, onChanged, actor, reviewed }: {
  sessionId: string; workflow: WorkflowState; checks: readonly ReadinessCheck[] | null; batch: BatchStatus | "none" | null; onChanged: () => Promise<unknown>; actor: Actor; reviewed: boolean;
}) {
  const [confirm, setConfirm] = useState<Kind | null>(null);
  const wf = workflowActions({ workflow, checks, batch, actor, reviewed });
  const row = (kind: Kind, a: WorkflowAction) => (
    <li key={kind} className="py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-body font-medium">{COPY[kind].button}</span>
        <KitButton variant="outline" size="sm" disabled={!a.enabled} aria-describedby={`wf-${kind}-reason`} onClick={() => setConfirm(kind)}>{COPY[kind].button}</KitButton>
      </div>
      <p id={`wf-${kind}-reason`} className="mt-1 text-label text-muted">{a.enabled ? (kind === "ready" ? (reviewed ? "Every readiness check passes." : "Every readiness check passes. The console allows this before the calculation is reviewed; review it first unless you mean to skip that.") : "An approved settlement exists for the current calculation.") : a.reason}</p>
    </li>
  );
  return (
    <Card className="mt-4">
      <h2 className="text-label uppercase tracking-wide text-muted">Session workflow</h2>
      <ul className="mt-1 divide-y divide-divider" aria-label="Session workflow actions">{row("ready", wf.markReady)}{row("close", wf.close)}</ul>
      <ConfirmDialog kind={confirm} onClose={() => setConfirm(null)} onConfirmed={onChanged} sessionId={sessionId} />
    </Card>
  );
}
