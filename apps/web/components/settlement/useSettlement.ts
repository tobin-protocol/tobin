"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { diffSettlement } from "../../lib/settlement/diff.ts";
import { client } from "../../lib/tobin/index.ts";
import type { BatchSummary } from "../../lib/tobin/types.ts";
import { useWorkspace } from "../shell/session.tsx";

/** The most recently prepared batch of the session (a rejected batch can be prepared again, so there may be several). */
export const latestBatch = (batches: readonly BatchSummary[]): BatchSummary | null =>
  [...batches].sort((a, b) => b.preparedAt.localeCompare(a.preparedAt) || b.attempt - a.attempt)[0] ?? null;

/**
 * The settlement data of one session, every piece from a real endpoint. Query keys sit under ["session", org, session, ...] so the workspace's refresh
 * invalidates them all. The execution and attempts are read only for the latest batch.
 */
export function useSettlement(sessionId: string) {
  const { org } = useWorkspace();
  const key = (p: string, extra?: string) => ["session", org.id, sessionId, p, ...(extra ? [extra] : [])] as const;
  const list = useQuery({ queryKey: key("settlement"), queryFn: () => client.settlement.list(org.id, sessionId), retry: false });
  const latest = useMemo(() => (list.data ? latestBatch(list.data.batches) : null), [list.data]);
  const batch = useQuery({ queryKey: key("batch", latest?.id), queryFn: () => client.settlement.batch(org.id, sessionId, latest!.id), enabled: !!latest, retry: false });
  const execution = useQuery({ queryKey: key("execution", latest?.id), queryFn: () => client.settlement.execution(org.id, sessionId, latest!.id), enabled: !!latest, retry: false });
  const attempts = useQuery({ queryKey: key("attempts", latest?.id), queryFn: () => client.settlement.attempts(org.id, sessionId, latest!.id), enabled: !!latest, retry: false });
  const calc = useQuery({ queryKey: key("calculation"), queryFn: () => client.sessions.calculation(org.id, sessionId), retry: false });
  const diff = useMemo(() => (batch.data && calc.data ? diffSettlement(calc.data.calculation, batch.data) : null), [batch.data, calc.data]);
  return { list, latest, batch, execution, attempts, calc, diff };
}
export type SettlementData = ReturnType<typeof useSettlement>;
