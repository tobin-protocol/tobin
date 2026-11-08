"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ApiError } from "../../lib/api/http.ts";
import { client } from "../../lib/tobin/index.ts";
import type { Actor } from "../../lib/permissions/can.ts";
import type { Me, Member, OrgBrief } from "../../lib/tobin/types.ts";
import { ErrorState, Skeleton } from "../ui/Feedback.tsx";
import { Button } from "../ui/Button.tsx";

export function useMe() {
  return useQuery({ queryKey: ["me"], queryFn: () => client.auth.me(), retry: false, staleTime: 30_000 });
}

interface Workspace {
  me: Me;
  orgs: OrgBrief[];
  org: OrgBrief;
  actor: Actor;
  /** false until the members list has loaded: reviewer status is not known yet */
  actorKnown: boolean;
  switchOrg: (id: string) => Promise<void>;
}
const WorkspaceContext = createContext<Workspace | null>(null);
export function useWorkspace(): Workspace {
  const c = useContext(WorkspaceContext);
  if (!c) throw new Error("useWorkspace must be used inside AppGate");
  return c;
}

/** Signed-in gate for everything under (app): redirects to sign-in when the session is gone, and to onboarding until the account has a profile and an organization. */
export function AppGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const qc = useQueryClient();
  const me = useMe();
  const [picked, setPicked] = useState<string | null>(null);

  const orgs = useMemo(() => me.data?.organizations ?? [], [me.data]);
  const onboarding = me.data?.onboarding;
  const orgId = picked && orgs.some((o) => o.id === picked) ? picked : me.data?.lastOrgId ?? orgs[0]?.id ?? null;

  useEffect(() => {
    if (me.error instanceof ApiError && me.error.status === 401) router.replace("/sign-in?expired=1");
  }, [me.error, router]);
  useEffect(() => {
    if (me.data && (onboarding?.step !== "done" || orgs.length === 0)) router.replace("/onboarding");
  }, [me.data, onboarding?.step, orgs.length, router]);

  const members = useQuery({
    queryKey: ["members", orgId],
    queryFn: () => client.organizations.members(orgId as string),
    enabled: !!orgId && !!me.data,
  });

  const switchOrg = useCallback(async (id: string) => {
    await client.auth.setWorkspace(id);
    setPicked(id);
    qc.removeQueries({ predicate: (q) => q.queryKey[0] !== "me" });
    await qc.invalidateQueries({ queryKey: ["me"] });
  }, [qc]);

  const value = useMemo<Workspace | null>(() => {
    if (!me.data || !orgId) return null;
    const org = orgs.find((o) => o.id === orgId);
    if (!org) return null;
    const mine: Member | undefined = members.data?.find((m) => m.you);
    const actor: Actor = { role: org.role, reviewer: mine?.reviewer ?? false, suspended: mine?.status === "suspended" };
    return { me: me.data, orgs, org, actor, actorKnown: !!mine, switchOrg };
  }, [me.data, orgs, orgId, members.data, switchOrg]);

  if (me.error && !(me.error instanceof ApiError && me.error.status === 401)) {
    return (
      <div className="mx-auto max-w-xl p-6">
        <ErrorState title="Tobin could not load your account" message={(me.error as Error).message} retry={<Button onClick={() => me.refetch()}>Try again</Button>} />
      </div>
    );
  }
  if (!value) {
    return (
      <div className="mx-auto max-w-[1200px] space-y-4 p-6" aria-busy="true" aria-label="Loading">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}
