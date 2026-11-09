"use client";

import { formatDateTime } from "../../lib/format.ts";
import { GROUPS, type LifecycleView } from "../../lib/sessions/lifecycle.ts";
import type { NextAction as NextActionData } from "../../lib/sessions/next-action.ts";
import type { BatchStatus, SessionDetail, SessionParticipantView } from "../../lib/tobin/types.ts";
import { AvatarStack } from "../ui/Data.tsx";
import { StatusMark } from "../ui/Feedback.tsx";
import { StageRail } from "../ui/Flow.tsx";
import { Card } from "../ui/Surfaces.tsx";
import { CopyButton } from "./shared.tsx";

const WORKFLOW = { configuring: "Being configured", ready: "Marked ready", closed: "Closed" } as const;

/** Under the page title: the identifier with a copy button, ONE status mark, the created time and who takes part. Nothing else. */
export function SessionHeader({ detail, participants }: { detail: SessionDetail; participants: SessionParticipantView[] | undefined }) {
  const o = detail.workspace.overview;
  const names = participants?.filter((p) => p.status === "active").map((p) => p.name) ?? [];
  return (
    <div className="mb-6 flex flex-wrap items-center gap-x-5 gap-y-3 border-y border-divider py-3">
      <StatusMark kind={detail.workflow === "closed" ? "done" : "progress"}>{WORKFLOW[detail.workflow]}</StatusMark>
      <span className="flex min-w-0 items-center gap-2">
        <span className="min-w-0 break-all font-mono text-ident text-muted" data-testid="session-id">{o.sessionId}</span>
        <CopyButton value={o.sessionId} label="Copy id" />
      </span>
      <span className="text-body text-muted">Created {formatDateTime(o.createdAt)}</span>
      {participants ? <span className="flex items-center gap-2"><AvatarStack names={names} /><span className="text-label text-muted">{names.length} participant{names.length === 1 ? "" : "s"}</span></span> : null}
    </div>
  );
}

/**
 * The ONE summary of the session: where it stands in the lifecycle (real facts; a fact that could not be read stops the walk instead of counting as done), the
 * four-square stage rail, and the next action. The rail fills only stages this app can record: Prepared when a settlement is prepared, never Signed, Submitted
 * or the final stage (no route exists for them).
 */
export function SummaryCard({ view, next, batch }: { view: LifecycleView; next: NextActionData; batch: BatchStatus | "none" | null }) {
  const prepared = batch !== null && batch !== "none" && batch !== "superseded" && batch !== "invalidated";
  const step = view.currentIndex >= GROUPS.length ? "All steps are done" : `Step ${view.currentIndex + 1} of ${GROUPS.length}: ${GROUPS[view.currentIndex]}`;
  return (
    <Card aria-label="Session summary" className="mb-6 space-y-4">
      <div>
        <h2 className="text-label uppercase tracking-wide text-muted">Where this session stands</h2>
        <p className="mt-1 text-entity font-medium">{step}</p>
        <p className="mt-0.5 text-body text-muted">{view.subLabel}{view.unread ? "" : " · Application record"}</p>
      </div>
      <StageRail input={{ state: undefined, verifiedReadBack: false, prepared }} />
      <p className="border-t border-divider pt-3 text-body"><span className="text-label uppercase tracking-wide text-muted">Next action </span><span className="font-medium">{next.title}</span><span className="text-muted"> · {next.who}{next.forYou ? ", and that is you" : ""}</span></p>
    </Card>
  );
}
