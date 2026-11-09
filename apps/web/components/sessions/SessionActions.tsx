"use client";

import { useState, type ReactNode } from "react";
import { Button as KitButton } from "@/components/kit/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/kit/dialog";
import { roleLabels, type Actor } from "../../lib/permissions/can.ts";
import { KIND_LABEL, REOPEN_CONSEQUENCES } from "../../lib/sessions/reopen.ts";
import type { NextAction as NextActionData, TabKey } from "../../lib/sessions/next-action.ts";
import { workflowActions, type WorkflowAction } from "../../lib/sessions/workflow-actions.ts";
import { client } from "../../lib/tobin/index.ts";
import type { BatchStatus, ReadinessCheck, WorkflowState } from "../../lib/tobin/types.ts";
import { useWorkspace } from "../shell/session.tsx";
import { ButtonLink } from "../ui/Button.tsx";
import { InlineError } from "../ui/Feedback.tsx";
import { NextAction as NextActionCard } from "../ui/Flow.tsx";
import { Card, Panel } from "../ui/Surfaces.tsx";
import { useReturnFocus } from "../tobin/Overlays.tsx";
import { reasonOf } from "./shared.tsx";

type Kind = "ready" | "close" | "reopen";
const COPY: Record<Kind, { button: string; title: string; description: ReactNode; confirm: string }> = {
  ready: {
    button: "Mark ready", title: "Mark this session ready?", confirm: "Mark ready",
    description: (
      <>
        <span className="block">Every readiness check passes. Marking it ready records that the application records are consistent.</span>
        <span className="mt-2 block">After this, participants and obligations cannot be changed unless an administrator reopens the session. Ready is not approval, signing or settlement.</span>
      </>
    ),
  },
  close: {
    button: "Close session", title: "Close this session?", confirm: "Close session",
    description: (
      <>
        <span className="block">An approved settlement exists for the current calculation, so the session can be closed.</span>
        <span className="mt-2 block">A closed session cannot change and cannot be reopened. This is an operational closure: it does not mean anything settled. Nothing has moved on any network.</span>
      </>
    ),
  },
  reopen: {
    button: "Reopen session", title: "Reopen this session?", confirm: "Reopen session",
    description: (
      <>
        <span className="block">Reopening makes it possible to change a session that was marked ready. Read what that means before you confirm.</span>
        {(["changes", "kept", "stale"] as const).map((k) => (
          <span key={k} className="mt-3 block">
            <span className="block text-label uppercase tracking-wide text-muted">{KIND_LABEL[k]}</span>
            <span className="block">{REOPEN_CONSEQUENCES.filter((c) => c.kind === k).map((c) => <span key={c.text} className="mt-1 block">{c.text}</span>)}</span>
          </span>
        ))}
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
  const back = useReturnFocus(!!kind);
  const run = async () => {
    if (!kind) return;
    setBusy(true); setError(null);
    try {
      if (kind === "ready") await client.sessions.markReady(org.id, sessionId);
      else if (kind === "close") await client.sessions.close(org.id, sessionId);
      else await client.sessions.reopen(org.id, sessionId);
      await onConfirmed();
      onClose();
    } catch (e) { setError(reasonOf(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog open={!!kind} onOpenChange={(o) => { if (!o && !busy) { setError(null); onClose(); } }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto" onCloseAutoFocus={back}>
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

const ENABLED_TEXT: Record<Kind, (reviewed: boolean) => string> = {
  ready: (reviewed) => (reviewed ? "Every readiness check passes." : "Every readiness check passes. The console allows this before the calculation is reviewed; review it first unless you mean to skip that."),
  close: () => "An approved settlement exists for the current calculation.",
  reopen: () => "Makes the session editable again. Nothing is deleted; the first change afterwards makes reviews and the prepared settlement stop applying.",
};

interface RowsProps { sessionId: string; workflow: WorkflowState; checks: readonly ReadinessCheck[] | null; batch: BatchStatus | "none" | null; actor: Actor; reviewed: boolean; onChanged: () => Promise<unknown> }

/**
 * The session workflow controls: Mark ready, Close session and, only while the session is ready, Reopen session. Each opens one confirmation. When an action is
 * unavailable its reason is written under it. `primary` names the one that is already the panel's primary button (it is then not repeated here).
 */
function WorkflowRows({ sessionId, workflow, checks, batch, actor, reviewed, onChanged, primary, idPrefix }: RowsProps & { primary: "close" | "ready" | null; idPrefix: string }) {
  const [confirm, setConfirm] = useState<Kind | null>(null);
  const wf = workflowActions({ workflow, checks, batch, actor, reviewed });
  const row = (kind: Kind, a: WorkflowAction) => (
    <li key={kind} className="py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-body font-medium">{COPY[kind].button}</span>
        {primary === kind ? <span className="text-label text-muted">Available above</span> : <KitButton variant="outline" size="sm" disabled={!a.enabled} aria-describedby={`${idPrefix}${kind}-reason`} onClick={() => setConfirm(kind)}>{COPY[kind].button}</KitButton>}
      </div>
      <p id={`${idPrefix}${kind}-reason`} className="mt-1 text-label text-muted">{a.enabled ? ENABLED_TEXT[kind](reviewed) : a.reason}</p>
    </li>
  );
  return (
    <>
      <ul className="mt-1 divide-y divide-divider" aria-label="Session workflow actions">
        {row("ready", wf.markReady)}
        {row("close", wf.close)}
        {workflow === "ready" ? row("reopen", wf.reopen) : null}
      </ul>
      <ConfirmDialog kind={confirm} onClose={() => setConfirm(null)} onConfirmed={onChanged} sessionId={sessionId} />
    </>
  );
}

/**
 * The session action panel for tabs without a panel of their own. It always shows exactly one primary button, or the reason there is none. The primary is,
 * in order: Close session (when it can be done), Mark ready (when it can be done after the calculation is reviewed), otherwise the next step of the lifecycle.
 */
export function SessionActionPanel({ sessionId, workflow, checks, batch, next, href, onReload, onChanged, actor, reviewed }: RowsProps & { next: NextActionData; href: (k: TabKey) => string; onReload: () => void }) {
  const [confirm, setConfirm] = useState<Kind | null>(null);
  const wf = workflowActions({ workflow, checks, batch, actor, reviewed });
  const nextPrimary = next.primary;

  let primary: ReactNode;
  if (wf.primary === "close") primary = <KitButton size="lg" className="w-full" onClick={() => setConfirm("close")}>Close session</KitButton>;
  else if (wf.primary === "ready") primary = <KitButton size="lg" className="w-full" onClick={() => setConfirm("ready")}>Mark ready</KitButton>;
  else if (nextPrimary && !nextPrimary.blockedBy) primary = nextPrimary.label === "Reload" ? <KitButton size="lg" className="w-full" onClick={onReload}>Reload</KitButton> : <ButtonLink href={href(nextPrimary.tab)} variant="primary" size="lg" className="w-full">{nextPrimary.label}</ButtonLink>;
  else if (nextPrimary) primary = <div className="space-y-2"><KitButton size="lg" className="w-full" disabled aria-describedby="action-reason">{nextPrimary.label}</KitButton><p id="action-reason" className="text-body text-muted" role="note">{nextPrimary.blockedBy}</p></div>;
  else primary = <p className="text-body text-muted" role="note">{next.reason}</p>;

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
        <WorkflowRows {...{ sessionId, workflow, checks, batch, actor, reviewed, onChanged }} primary={wf.primary} idPrefix="" />
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

/** The same controls for tabs whose own panel owns the primary button (secondary buttons only). */
export function WorkflowCard(props: RowsProps) {
  return (
    <Card className="mt-4">
      <h2 className="text-label uppercase tracking-wide text-muted">Session workflow</h2>
      <WorkflowRows {...props} primary={null} idPrefix="wf-" />
    </Card>
  );
}
