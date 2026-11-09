"use client";

// THE cross-session hook. The API has no aggregate endpoint, so screens that show figures across sessions read the newest `cap` sessions one by one. This is
// the only place that does it: it owns the window (starts at 10, "Load next 10 sessions" extends it), the per-session reads, and the coverage sentence. When an
// aggregate endpoint exists, only this file changes. `passive` reads what is already cached and makes no request (the shell's Reviews count uses it).
import { useQueries, useQuery } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { Bundle } from "../../lib/cross-session/overview.ts";
import { INITIAL_CAP, canLoadMore as canLoad, coverageOf, nextCap, windowOf, type Coverage } from "../../lib/cross-session/window.ts";
import { client } from "../../lib/tobin/index.ts";
import type { SessionRow } from "../../lib/tobin/types.ts";
import { useWorkspace } from "../shell/session.tsx";

export type Part = "detail" | "authorization";

interface CapCtx { cap: number; loadNext: (total: number) => void }
const CapContext = createContext<CapCtx | null>(null);

/** Holds the window per organization, so the Overview, the Sessions list and the shell agree on how many sessions have been read. */
export function CrossSessionProvider({ children }: { children: ReactNode }) {
  const { org } = useWorkspace();
  const [caps, setCaps] = useState<Record<string, number>>({});
  const cap = caps[org.id] ?? INITIAL_CAP;
  const loadNext = useCallback((total: number) => setCaps((c) => ({ ...c, [org.id]: nextCap(c[org.id] ?? INITIAL_CAP, total) })), [org.id]);
  const value = useMemo(() => ({ cap, loadNext }), [cap, loadNext]);
  return <CapContext.Provider value={value}>{children}</CapContext.Provider>;
}

export interface CrossSession {
  rows: SessionRow[] | undefined;
  total: number;
  /** the sessions inside the window, newest first */
  window: SessionRow[];
  /** one entry per session in the window whose reads have finished */
  bundles: Bundle[];
  cap: number;
  coverage: Coverage;
  /** the session list itself is loading */
  listLoading: boolean;
  listError: Error | null;
  /** some per-session reads are still running */
  reading: boolean;
  canLoadMore: boolean;
  loadNext: () => void;
}

export function useCrossSession({ parts, passive = false }: { parts: readonly Part[]; passive?: boolean }): CrossSession {
  const { org } = useWorkspace();
  const ctx = useContext(CapContext);
  if (!ctx) throw new Error("useCrossSession must be used inside CrossSessionProvider");
  const list = useQuery({ queryKey: ["sessions", org.id], queryFn: () => client.sessions.list(org.id), enabled: !passive });
  const rows = list.data;
  const win = useMemo(() => (rows ? windowOf(rows, ctx.cap) : []), [rows, ctx.cap]);
  const partsKey = [...parts].sort().join("+");
  const queries = useQueries({
    queries: win.map((row) => ({
      queryKey: ["bundle", org.id, row.sessionId, partsKey],
      enabled: !passive,
      staleTime: 30_000,
      retry: false,
      queryFn: async (): Promise<Bundle> => {
        const wants = new Set(parts);
        const [d, a] = await Promise.allSettled([
          wants.has("detail") ? client.sessions.get(org.id, row.sessionId) : Promise.resolve(undefined),
          wants.has("authorization") ? client.authorization.get(org.id, row.sessionId) : Promise.resolve(undefined),
        ]);
        return {
          row,
          ...(d.status === "fulfilled" && d.value ? { detail: d.value } : {}),
          ...(a.status === "fulfilled" && a.value ? { authorization: a.value } : {}),
          failed: d.status === "rejected" || a.status === "rejected",
        };
      },
    })),
  });
  const bundles = queries.map((q) => q.data).filter((b): b is Bundle => !!b);
  const total = rows?.length ?? 0;
  const read = bundles.filter((b) => !b.failed).length;
  return {
    rows, total, window: win, bundles, cap: ctx.cap,
    coverage: coverageOf(read, total, bundles.length - read),
    listLoading: list.isLoading, listError: (list.error as Error | null) ?? null,
    reading: queries.some((q) => q.isLoading),
    canLoadMore: canLoad(ctx.cap, total),
    loadNext: () => ctx.loadNext(total),
  };
}
