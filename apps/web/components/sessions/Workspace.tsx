"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ApiError } from "../../lib/api/http.ts";
import { eligibility } from "../../lib/netting/group.ts";
import { closeOutOf } from "../../lib/settlement/closeout.ts";
import { lifecycleOf } from "../../lib/sessions/lifecycle.ts";
import { nextActionOf, type TabKey } from "../../lib/sessions/next-action.ts";
import { client } from "../../lib/tobin/index.ts";
import type { BatchStatus } from "../../lib/tobin/types.ts";
import { PageFrame } from "../shell/PageFrame.tsx";
import { useWorkspace } from "../shell/session.tsx";
import { Button, ButtonLink } from "../ui/Button.tsx";
import { PageTabs, type TabItem } from "../ui/Data.tsx";
import { ErrorState, Skeleton } from "../ui/Feedback.tsx";
import { Panel } from "../ui/Surfaces.tsx";
import { ReviewPanel } from "../approvals/ReviewPanel.tsx";
import { NettingTab, RunNettingPanel } from "../netting/NettingTab.tsx";
import { ObligationsTab } from "../obligations/ObligationsTab.tsx";
import { RecordObligationPanel } from "../obligations/RecordObligation.tsx";
import { SettlementPanel } from "../settlement/SettlementPanel.tsx";
import { CloseOut, closeOutFacts, isStep } from "../settlement/CloseOut.tsx";
import { useSettlement } from "../settlement/useSettlement.ts";
import { ActionSheet } from "./ActionSheet.tsx";
import { OverviewTab } from "./OverviewTab.tsx";
import { SessionActionPanel, WorkflowCard } from "./SessionActions.tsx";
import { SessionHeader, SummaryCard } from "./SessionSummary.tsx";
import { reasonOf } from "./shared.tsx";
import { ActivityTab, ParticipantsTab } from "./tabs.tsx";

/** The six tabs. The calculation review is step 1 of the Settlement close-out; the old ?tab=approvals address redirects there. */
const TABS: { key: Exclude<TabKey, "approvals">; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "participants", label: "Participants" },
  { key: "obligations", label: "Obligations" },
  { key: "netting", label: "Netting" },
  { key: "settlement", label: "Settlement" },
  { key: "activity", label: "Activity" },
];
const KNOWN = new Set<string>([...TABS.map((t) => t.key), "approvals"]);
const isTab = (v: string | null): v is TabKey => v !== null && KNOWN.has(v);

export function Workspace() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const params = useSearchParams();
  const { org, actor } = useWorkspace();
  const qc = useQueryClient();
  const router = useRouter();
  const raw = params.get("tab");
  const tab: TabKey = isTab(raw) ? raw : "overview";
  const group: Exclude<TabKey, "approvals"> = tab === "approvals" ? "settlement" : tab;
  const stepParam = params.get("step");
  useEffect(() => { if (raw === "approvals") router.replace(`/sessions/${sessionId}?tab=settlement&step=review`); }, [raw, router, sessionId]);
  const key = (part: string) => ["session", org.id, sessionId, part] as const;

  const detail = useQuery({ queryKey: key("detail"), queryFn: () => client.sessions.get(org.id, sessionId), retry: false });
  const participants = useQuery({ queryKey: key("participants"), queryFn: () => client.participants.list(org.id, sessionId), retry: false });
  const obligations = useQuery({ queryKey: key("obligations"), queryFn: () => client.obligations.listBySession(org.id, sessionId), retry: false });
  const readiness = useQuery({ queryKey: key("readiness"), queryFn: () => client.sessions.readiness(org.id, sessionId), retry: false });
  const authorization = useQuery({ queryKey: key("authorization"), queryFn: () => client.authorization.get(org.id, sessionId), retry: false });
  const settle = useSettlement(sessionId);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  const label = detail.data?.workspace.overview.label;
  useEffect(() => { document.title = label ? `Session: ${label} · Tobin` : "Session · Tobin"; }, [label]);

  const refresh = () => Promise.all([
    qc.invalidateQueries({ queryKey: ["session", org.id, sessionId] }),
    qc.invalidateQueries({ queryKey: ["xs", org.id, sessionId] }),
    qc.invalidateQueries({ queryKey: ["sessions", org.id] }),
  ]);
  const runNetting = async () => {
    setRunning(true); setRunError(null);
    try { await client.netting.run(org.id, sessionId); } catch (e) { setRunError(reasonOf(e)); }
    await refresh(); setRunning(false);
  };

  const workflow = detail.data?.workflow;
  const batch: BatchStatus | "none" | null = settle.list.data ? (settle.latest ? (settle.latest.status as BatchStatus) : "none") : null;
  const view = useMemo(() => {
    if (!workflow) return null;
    return lifecycleOf({
      workflow,
      activeParticipants: participants.data ? participants.data.filter((p) => p.status === "active").length : null,
      activeObligations: obligations.data ? obligations.data.filter((o) => o.status === "active").length : null,
      currency: readiness.data?.currency ?? null,
      auth: authorization.data?.state ?? null,
      batch,
    });
  }, [workflow, participants.data, obligations.data, readiness.data, authorization.data, batch]);
  const next = useMemo(() => (view && workflow ? nextActionOf(view, workflow, actor) : null), [view, workflow, actor]);

  const crumbs = [{ label: org.name }, { href: "/sessions", label: "Sessions" }, { label: label ?? "Session" }];
  if (detail.error) {
    const notFound = detail.error instanceof ApiError && detail.error.status === 404;
    return (
      <PageFrame title={notFound ? "Session not found" : "Could not load the session"} breadcrumbs={crumbs}>
        <ErrorState title={notFound ? "This session does not exist in this organization" : "Could not load the session"} message={notFound ? "It may belong to another organization, or the link may be wrong. Check the organization selector." : (detail.error as Error).message}
          retry={<div className="flex gap-2"><ButtonLink href="/sessions" variant="quiet">Back to sessions</ButtonLink>{!notFound ? <Button onClick={() => detail.refetch()}>Try again</Button> : null}</div>} />
      </PageFrame>
    );
  }
  // a fact still loading is not "unread": wait for all of them, so the summary never flashes a false read failure
  const factsPending = [participants, obligations, readiness, authorization, settle.list].some((x) => x.isPending);
  if (detail.isLoading || !detail.data || !view || !next || factsPending) {
    return (
      <PageFrame title="Session" breadcrumbs={crumbs} sensitive>
        <div className="space-y-4" role="status" aria-busy="true" aria-label="Loading session"><Skeleton className="h-12 w-full" /><Skeleton className="h-40 w-full" /><Skeleton className="h-64 w-full" /></div>
      </PageFrame>
    );
  }

  const activeIds = new Set((participants.data ?? []).filter((p) => p.status === "active").map((p) => p.userId));
  const nettingElig = eligibility(obligations.data ?? [], activeIds);
  const href = (k: TabKey) => (k === "overview" ? `/sessions/${sessionId}` : `/sessions/${sessionId}?tab=${k}`);
  const tabs: TabItem[] = TABS.map((t) => ({ href: href(t.key), label: t.label, count: t.key === "participants" ? participants.data?.filter((p) => p.status === "active").length ?? null : t.key === "obligations" ? obligations.data?.filter((x) => x.status === "active").length ?? null : null }));
  const checks = readiness.data?.checks ?? null;
  const wfProps = { sessionId, workflow: detail.data.workflow, checks, batch, onChanged: refresh, actor, reviewed: view.currentIndex >= 5 };

  return (
    <PageFrame title={detail.data.workspace.overview.label} breadcrumbs={crumbs} sensitive>
      <SessionHeader detail={detail.data} participants={participants.data} />
      <SummaryCard view={view} next={next} batch={batch} />
      <div className="mb-6 border-b border-divider"><PageTabs label="Session sections" items={tabs} activeHref={href(group)} /></div>

      <div className="grid gap-6 max-md:pb-16 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Panel className="min-w-0 space-y-6 xl:order-1" id="tab-content" aria-label="Section content">
          {group === "overview" ? <OverviewTab detail={detail.data} readiness={readiness} participants={participants.data} obligations={obligations.data} sessionId={sessionId} /> : null}
          {group === "participants" ? <ParticipantsTab sessionId={sessionId} query={participants} workflow={detail.data.workflow} onChanged={refresh} /> : null}
          {group === "obligations" ? <ObligationsTab sessionId={sessionId} query={obligations} workflow={detail.data.workflow} activity={detail.data.workspace.activity.items} onChanged={refresh} /> : null}
          {group === "netting" ? <NettingTab sessionId={sessionId} obligations={obligations.data} participants={participants.data} readiness={readiness.data} running={running} runError={runError} /> : null}
          {group === "settlement" ? <CloseOut s={settle} auth={authorization} obligations={obligations.data} calc={settle.calc.data} workflow={detail.data.workflow} sessionId={sessionId} shown={isStep(stepParam) ? stepParam : null} /> : null}
          {group === "activity" ? <ActivityTab detail={detail.data} sessionId={sessionId} /> : null}
        </Panel>
        <ActionSheet summary={group === "obligations" ? "Record an obligation" : group === "netting" ? "Run netting" : group === "settlement" ? "Close-out action" : next.primary?.label ?? next.title}>
          {group === "obligations" ? <><RecordObligationPanel sessionId={sessionId} participants={participants.data ?? []} workflow={detail.data.workflow} onRecorded={refresh} /><WorkflowCard {...wfProps} /></>
            : group === "netting" ? <><RunNettingPanel excludedCount={nettingElig.excluded.length} eligibleCount={nettingElig.eligible.length} excludedBlocking={nettingElig.excluded.filter((x) => x.reason === "inactive-participant").length} participantCount={activeIds.size} asset={nettingElig.eligible[0]?.asset ?? null} workflow={detail.data.workflow} running={running} error={runError} onRun={runNetting} /><WorkflowCard {...wfProps} /></>
            : group === "settlement" ? <>{authorization.data && (closeOutOf(closeOutFacts(settle, authorization.data, detail.data.workflow)).current === "review" || authorization.data.state !== "approved") ? <ReviewPanel sessionId={sessionId} auth={authorization.data} onDecided={refresh} /> : <SettlementPanel sessionId={sessionId} s={settle} workflow={detail.data.workflow} onChanged={refresh} />}<WorkflowCard {...wfProps} /></>
            : <SessionActionPanel {...wfProps} next={next} href={href} onReload={refresh} />}
        </ActionSheet>
      </div>
    </PageFrame>
  );
}
