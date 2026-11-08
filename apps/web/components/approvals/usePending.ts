"use client";

import { useQueries, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { selectForReading } from "../../lib/derived/overview.ts";
import { client } from "../../lib/tobin/index.ts";
import { useWorkspace } from "../shell/session.tsx";

export interface Pending { count: number | null; shown: number; total: number; capped: boolean; loading: boolean }

/**
 * Approvals awaiting THIS user, DERIVED from per-session reads (capped, decision D6). Only a reviewer can have any, so nothing is requested for anyone else.
 * A calculation counts when the server says the user can decide it; a settlement batch counts when it is awaiting review (the list does not say who prepared
 * it, so a batch the user prepared themselves may be counted: the Approvals page shows the server's reason on open). Shares the cache keys of the
 * workspace and the Approvals page.
 */
export function useApprovalsPending(): Pending {
  const { org, actor, actorKnown } = useWorkspace();
  const enabled = actorKnown && actor.reviewer;
  const sessions = useQuery({ queryKey: ["sessions", org.id], queryFn: () => client.sessions.list(org.id), enabled });
  const toRead = useMemo(() => (sessions.data ? selectForReading(sessions.data) : []), [sessions.data]);
  const auths = useQueries({ queries: toRead.map((r) => ({ queryKey: ["session", org.id, r.sessionId, "authorization"], queryFn: () => client.authorization.get(org.id, r.sessionId), staleTime: 30_000, retry: false })) });
  const sets = useQueries({ queries: toRead.map((r) => ({ queryKey: ["session", org.id, r.sessionId, "settlement"], queryFn: () => client.settlement.list(org.id, r.sessionId), staleTime: 30_000, retry: false })) });
  if (!enabled) return { count: null, shown: 0, total: 0, capped: false, loading: false };
  const loading = sessions.isLoading || auths.some((q) => q.isLoading) || sets.some((q) => q.isLoading);
  let count = 0;
  toRead.forEach((_, i) => {
    const a = auths[i]?.data;
    if (a && a.state === "awaiting-review" && a.eligibility.canDecide) count += 1;
    const s = sets[i]?.data;
    const latest = s ? [...s.batches].sort((x, y) => y.preparedAt.localeCompare(x.preparedAt))[0] : undefined;
    if (latest?.status === "awaiting-review") count += 1;
  });
  const total = sessions.data?.length ?? 0;
  return { count: loading ? null : count, shown: toRead.length, total, capped: total > toRead.length, loading };
}
