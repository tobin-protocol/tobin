"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { ApiError } from "../../lib/api/http.ts";
import { roleLabels } from "../../lib/permissions/can.ts";
import { formatDateTime } from "../../lib/format.ts";
import { lifecycleOf } from "../../lib/sessions/lifecycle.ts";
import { nextActionOf, type NextAction, type TabKey } from "../../lib/sessions/next-action.ts";
import { client } from "../../lib/tobin/index.ts";
import { PageFrame } from "../shell/PageFrame.tsx";
import { useWorkspace } from "../shell/session.tsx";
import { Button, ButtonLink } from "../ui/Button.tsx";
import { AvatarStack, PageTabs, type TabItem } from "../ui/Data.tsx";
import { ErrorState, Skeleton } from "../ui/Feedback.tsx";
import { NextAction as NextActionCard, Stepper } from "../ui/Flow.tsx";
import { Card, Panel } from "../ui/Surfaces.tsx";
import { CopyButton } from "./shared.tsx";
import { ActivityTab, ApprovalsTab, OverviewTab, ParticipantsTab, SettlementTab } from "./tabs.tsx";
import { NettingTab, RunNettingPanel } from "../netting/NettingTab.tsx";
import { ObligationsTab } from "../obligations/ObligationsTab.tsx";
import { RecordObligationPanel } from "../obligations/RecordObligation.tsx";
import { eligibility } from "../../lib/netting/group.ts";
import { reasonOf } from "./shared.tsx";

const TABS: { key: TabKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "participants", label: "Participants" },
  { key: "obligations", label: "Obligations" },
  { key: "netting", label: "Netting" },
  { key: "approvals", label: "Approvals" },
  { key: "settlement", label: "Settlement" },
  { key: "activity", label: "Activity" },
];
const isTab = (v: string | null): v is TabKey => TABS.some((t) => t.key === v);

const WORKFLOW_LABEL = { configuring: "Being configured", ready: "Marked ready", closed: "Closed" } as const;

export function Workspace() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const params = useSearchParams();
  const { org, actor } = useWorkspace();
  const qc = useQueryClient();
  const raw = params.get("tab");
  const tab: TabKey = isTab(raw) ? raw : "overview";
  const key = (part: string) => ["session", org.id, sessionId, part] as const;

  const detail = useQuery({ queryKey: key("detail"), queryFn: () => client.sessions.get(org.id, sessionId), retry: false });
  const participants = useQuery({ queryKey: key("participants"), queryFn: () => client.participants.list(org.id, sessionId), retry: false });
  const obligations = useQuery({ queryKey: key("obligations"), queryFn: () => client.obligations.listBySession(org.id, sessionId), retry: false });
  const readiness = useQuery({ queryKey: key("readiness"), queryFn: () => client.sessions.readiness(org.id, sessionId), retry: false });
  const authorization = useQuery({ queryKey: key("authorization"), queryFn: () => client.authorization.get(org.id, sessionId), retry: false });

  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const refresh = () => Promise.all([
    qc.invalidateQueries({ queryKey: ["session", org.id, sessionId] }),
    qc.invalidateQueries({ queryKey: ["bundle", org.id, sessionId] }),
    qc.invalidateQueries({ queryKey: ["sessions", org.id] }),
  ]);

  const runNetting = async () => {
    setRunning(true); setRunError(null);
    try { await client.netting.run(org.id, sessionId); } catch (e) { setRunError(reasonOf(e)); }
    await refresh(); setRunning(false);
  };
  const workflow = detail.data?.workflow;
  const view = useMemo(() => {
    if (!workflow) return null;
    return lifecycleOf({
      workflow,
      activeParticipants: participants.data ? participants.data.filter((p) => p.status === "active").length : null,
      activeObligations: obligations.data ? obligations.data.filter((o) => o.status === "active").length : null,
      currency: readiness.data?.currency ?? null,
      auth: authorization.data?.state ?? null,
    });
  }, [workflow, participants.data, obligations.data, readiness.data, authorization.data]);
  const next = useMemo(() => (view && workflow ? nextActionOf(view, workflow, actor) : null), [view, workflow, actor]);

  const crumbs = [{ label: org.name }, { href: "/sessions", label: "Clearing Sessions" }, { label: detail.data?.workspace.overview.label ?? "Session" }];

  if (detail.error) {
    const notFound = detail.error instanceof ApiError && detail.error.status === 404;
    return (
      <PageFrame title={notFound ? "Session not found" : "Could not load the session"} breadcrumbs={crumbs}>
        <ErrorState title={notFound ? "This session does not exist in this organization" : "Could not load the session"} message={notFound ? "It may belong to another organization, or the link may be wrong. Check the organization selector in the header." : (detail.error as Error).message}
          retry={<div className="flex gap-2"><ButtonLink href="/sessions" variant="quiet">Back to sessions</ButtonLink>{!notFound ? <Button onClick={() => detail.refetch()}>Try again</Button> : null}</div>} />
      </PageFrame>
    );
  }
  // a query that is still loading is not "unread": wait for every fact, so the Stepper never flashes a false read failure
  const factsPending = [participants, obligations, readiness, authorization].some((x) => x.isPending);
  if (detail.isLoading || !detail.data || !view || !next || factsPending) {
    return (
      <PageFrame title="Session" breadcrumbs={crumbs} sensitive>
        <div className="space-y-4" aria-busy="true" aria-label="Loading session"><Skeleton className="h-24 w-full" /><Skeleton className="h-12 w-full" /><Skeleton className="h-64 w-full" /></div>
      </PageFrame>
    );
  }

  const activeIds = new Set((participants.data ?? []).filter((p) => p.status === "active").map((p) => p.userId));
  const nettingElig = eligibility(obligations.data ?? [], activeIds);
  const o = detail.data.workspace.overview;
  const href = (k: TabKey) => (k === "overview" ? `/sessions/${sessionId}` : `/sessions/${sessionId}?tab=${k}`);
  const tabs: TabItem[] = TABS.map((t) => ({ href: href(t.key), label: t.label, count: t.key === "participants" ? participants.data?.filter((p) => p.status === "active").length ?? null : t.key === "obligations" ? obligations.data?.filter((x) => x.status === "active").length ?? null : null }));

  return (
    <PageFrame title={o.label} breadcrumbs={crumbs} sensitive>
      <Panel className="mb-6 space-y-4" aria-label="Session summary">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-body">
          <span className="font-medium">{WORKFLOW_LABEL[detail.data.workflow]}</span>
          <span className="text-muted">{o.provenance === "local-draft" ? "Local draft · Application record" : detail.data.workspace.banner?.label ?? o.provenance}</span>
          <span className="text-muted">Created {formatDateTime(o.createdAt)}</span>
          {participants.data ? <AvatarStack names={participants.data.filter((p) => p.status === "active").map((p) => p.name)} /> : null}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="min-w-0 break-all font-mono text-ident text-muted" data-testid="session-id">{o.sessionId}</span>
          <CopyButton value={o.sessionId} label="Copy id" />
        </div>
        <Card><Stepper currentIndex={view.currentIndex} subLabel={view.subLabel} applicationOnly /></Card>
      </Panel>

      <div className="mb-6 border-b border-divider"><PageTabs label="Session sections" items={tabs} activeHref={href(tab)} /></div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        <Panel className="order-2 min-w-0 space-y-6 lg:order-1" id="tab-content" aria-label="Section content">
          {tab === "overview" ? <OverviewTab detail={detail.data} readiness={readiness} next={next} /> : null}
          {tab === "participants" ? <ParticipantsTab sessionId={sessionId} query={participants} workflow={detail.data.workflow} onChanged={refresh} /> : null}
          {tab === "obligations" ? <ObligationsTab sessionId={sessionId} query={obligations} workflow={detail.data.workflow} activity={detail.data.workspace.activity.items} onChanged={refresh} /> : null}
          {tab === "netting" ? <NettingTab sessionId={sessionId} obligations={obligations.data} participants={participants.data} readiness={readiness.data} running={running} runError={runError} /> : null}
          {tab === "approvals" ? <ApprovalsTab query={authorization} /> : null}
          {tab === "settlement" ? <SettlementTab /> : null}
          {tab === "activity" ? <ActivityTab detail={detail.data} /> : null}
        </Panel>
        <aside className="order-1 min-w-0 lg:sticky lg:top-24 lg:order-2 lg:self-start" aria-label="Session action">
          {tab === "obligations" ? <RecordObligationPanel sessionId={sessionId} participants={participants.data ?? []} workflow={detail.data.workflow} onRecorded={refresh} />
            : tab === "netting" ? <RunNettingPanel eligibleCount={nettingElig.eligible.length} excludedBlocking={nettingElig.excluded.filter((x) => x.reason === "inactive-participant").length} participantCount={activeIds.size} asset={nettingElig.eligible[0]?.asset ?? null} workflow={detail.data.workflow} running={running} error={runError} onRun={runNetting} />
            : <ActionPanel next={next} href={href} onReload={refresh} actorLabel={roleLabels(actor).join(", ")} />}
        </aside>
      </div>
    </PageFrame>
  );
}

/** Always shows exactly one primary button, or the reason the current user cannot act. */
function ActionPanel({ next, href, onReload, actorLabel }: { next: NextAction; href: (k: TabKey) => string; onReload: () => void; actorLabel: string }) {
  const p = next.primary;
  return (
    <Panel className="space-y-4" aria-label="Next step">
      <NextActionCard title={next.title} who={next.who} forYou={next.forYou}>
        {p ? (
          p.blockedBy ? (
            <div className="space-y-2">
              <Button variant="primary" size="lg" disabled aria-describedby="action-reason">{p.label}</Button>
              <p id="action-reason" className="text-body text-muted" role="note">{p.blockedBy}</p>
            </div>
          ) : p.label === "Reload" ? (
            <Button variant="primary" size="lg" onClick={onReload}>{p.label}</Button>
          ) : (
            <ButtonLink href={href(p.tab)} variant="primary" size="lg">{p.label}</ButtonLink>
          )
        ) : (
          <p className="text-body text-muted" role="note">{next.reason}</p>
        )}
      </NextActionCard>
      <Card>
        <p className="text-label uppercase tracking-wide text-muted">Your access</p>
        <p className="mt-1 text-body font-medium">{actorLabel}</p>
        <p className="mt-1 text-label text-muted">This panel shows what you can do. The server makes the final decision and always wins. Approval in Tobin is not a Stellar signature.</p>
      </Card>
    </Panel>
  );
}
