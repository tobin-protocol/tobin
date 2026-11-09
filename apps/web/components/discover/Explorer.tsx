"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { discover } from "../../lib/discover/client.ts";
import { EMPTY_BODY, EMPTY_TILE, SORTS, TABS, institutionView, parseSort, parseTab, settlementView, statsView } from "../../lib/discover/view.ts";
import type { DiscoverTab, PublicAssetUse, PublicInstitution, PublicSettlement } from "../../lib/discover/types.ts";
import { PageTabs } from "../ui/Data.tsx";
import { StatGrid } from "../ui/Surfaces.tsx";
import { ErrorState, Skeleton } from "../ui/Feedback.tsx";
import { Button } from "@/components/kit/button";
import type { DiscoverResult, Page } from "../../lib/discover/types.ts";
import { formatAmount, formatDateTime } from "../../lib/format.ts";

const TILE = "flex min-h-[86px] flex-col justify-center gap-1 bg-tile px-4 py-3";

function EmptyTile({ note, tab }: { note?: string; tab: DiscoverTab }) {
  return (
    <li className={TILE}>
      <p className="font-label text-label uppercase tracking-wider">{EMPTY_TILE.title}</p>
      <p className="text-body text-muted">{note ?? EMPTY_BODY[tab]}</p>
    </li>
  );
}

function SettlementTile({ s }: { s: PublicSettlement }) {
  const v = settlementView(s);
  return (
    <li className={TILE}>
      <p className="flex flex-wrap items-center gap-2"><span className="font-mono text-ident">{v.identifier}</span>{v.mark ? <span className="bg-ink px-2 py-0.5 font-label text-label uppercase tracking-wider text-on-button">{v.mark}</span> : null}</p>
      <p className="text-body text-muted">{v.parties ?? v.title}</p>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-body"><span className="num font-medium">{v.amount}</span><span className="border border-divider px-2 text-label">{v.time}</span><span className="border border-divider px-2 text-label">{v.network}</span>
        {v.explorerHref ? <a href={v.explorerHref} target="_blank" rel="noreferrer noopener" className="inline-flex min-h-11 items-center underline underline-offset-4">View on Stellar Expert ({v.network})<span className="sr-only"> (opens in a new tab)</span></a> : null}
      </p>
    </li>
  );
}

function InstitutionTile({ i }: { i: PublicInstitution }) {
  const v = institutionView(i);
  return (
    <li className={TILE}>
      <p className="font-mono text-ident">{v.identifier}</p>
      <p className="text-body font-medium">{v.title}</p>
      {v.chips.length ? <p className="flex flex-wrap gap-2">{v.chips.map((c) => <span key={c} className="border border-divider px-2 text-label">{c}</span>)}</p> : null}
    </li>
  );
}

function AssetTile({ a }: { a: PublicAssetUse }) {
  return (
    <li className={TILE}>
      <p className="font-label text-label uppercase tracking-wider">{a.asset.code}</p>
      <p className="num text-body font-medium">{formatAmount(a.settledAmount, a.asset.code)}</p>
      <p className="flex flex-wrap gap-2"><span className="border border-divider px-2 text-label">{a.settlementCount} settlement{a.settlementCount === 1 ? "" : "s"}</span><span className="border border-divider px-2 text-label">Latest {formatDateTime(a.lastSettledAt)}</span></p>
    </li>
  );
}

/** Protocol stats, sub-tabs, a URL-driven sort bar and a cursor-paged tile list over the public API. A null figure reads "No data"; an empty list shows the API note. */
export function Explorer() {
  const params = useSearchParams();
  const path = usePathname();
  const router = useRouter();
  const tab: DiscoverTab = parseTab(params.get("tab"));
  const sort = parseSort(tab, params.get("sort"));
  const stats = useQuery({ queryKey: ["discover", "stats"], queryFn: () => discover.stats() });
  const list = useInfiniteQuery({
    queryKey: ["discover", tab, sort],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }): Promise<DiscoverResult<Page<PublicSettlement | PublicInstitution | PublicAssetUse>>> => {
      const q = { sort: sort as never, cursor: pageParam };
      if (tab === "settlements") return discover.settlements(q);
      if (tab === "institutions") return discover.institutions(q);
      return discover.assets(q);
    },
    getNextPageParam: (last) => (last.kind === "ok" ? (last.data.nextCursor ?? undefined) : undefined),
  });
  const setSort = (next: string) => { const q = new URLSearchParams(params.toString()); q.set("tab", tab); q.set("sort", next); router.replace(`${path}?${q.toString()}`, { scroll: false }); };
  const tabs = TABS.map((t) => ({ href: `${path}?tab=${t.id}`, label: t.label }));
  const pages = list.data?.pages ?? [];
  const failed = pages.find((p) => p.kind === "error") ?? null;
  const items = pages.flatMap((p) => (p.kind === "ok" ? p.data.items : []));
  const note = pages[0]?.kind === "ok" ? pages[0].data.note : undefined;
  const statsNote = stats.data?.kind === "ok" ? stats.data.data.note : undefined;
  return (
    <div className="space-y-6">
      <section aria-labelledby="stats-h">
        <h2 id="stats-h" className="sr-only">Protocol statistics</h2>
        <StatGrid columns={4} items={statsView(stats.data).map((s) => ({ label: s.label, value: s.value }))} />
        {stats.data?.kind === "error" ? <p role="alert" className="mt-2 text-body text-danger">{stats.data.message}</p> : statsNote ? <p className="mt-2 text-body text-muted">{statsNote}</p> : null}
      </section>

      <section aria-labelledby="explore-h">
        <h2 id="explore-h" className="sr-only">Explore</h2>
        <div className="border-b border-divider"><PageTabs items={tabs} activeHref={`${path}?tab=${tab}`} label="Discover sections" /></div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-3 border border-divider px-3">
            <span className="font-label text-label uppercase tracking-wider text-muted">Sort by</span>
            <select value={sort} onChange={(e) => setSort(e.target.value)} className="min-h-10 bg-transparent py-1 text-body font-semibold underline underline-offset-4 max-md:min-h-11">
              {SORTS[tab].map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
        </div>
        {list.isPending ? (
          <ul aria-busy="true" aria-label="Loading" className="mt-4 space-y-2"><li><Skeleton className="h-[86px] w-full" /></li></ul>
        ) : list.isError || (failed && items.length === 0) ? (
          <div className="mt-4"><ErrorState title="Could not load this list" message={failed?.kind === "error" ? failed.message : "Tobin could not load this list."} retry={<Button variant="outline" onClick={() => void list.refetch()}>Try again</Button>} /></div>
        ) : (
          <>
            <ul aria-label={`${TABS.find((t) => t.id === tab)?.label}`} className="mt-4 space-y-2">
              {items.length === 0 ? <EmptyTile note={note} tab={tab} /> : tab === "settlements" ? (items as PublicSettlement[]).map((s) => <SettlementTile key={s.id} s={s} />) : tab === "institutions" ? (items as PublicInstitution[]).map((i) => <InstitutionTile key={i.id} i={i} />) : (items as PublicAssetUse[]).map((a) => <AssetTile key={a.asset.code + (a.asset.issuer ?? "")} a={a} />)}
            </ul>
            {failed ? <p role="alert" className="mt-2 text-body text-danger">{failed.kind === "error" ? failed.message : ""}</p> : null}
            {list.hasNextPage ? <div className="mt-4"><Button variant="outline" disabled={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>{list.isFetchingNextPage ? "Loading" : "Load more"}</Button></div> : null}
          </>
        )}
      </section>
    </div>
  );
}
