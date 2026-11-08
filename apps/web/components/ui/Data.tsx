"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { createColumnHelper, tableFeatures, useTable, type RowData } from "@tanstack/react-table";
import { cn, formatAmount, middle } from "../../lib/format.ts";
import { ErrorState, Skeleton } from "./Feedback.tsx";
import { Button } from "./Button.tsx";

/** Value and asset code always together. Never a bare number. Right-aligned, tabular. */
export function Amount({ value, asset, className }: { value: string | null | undefined; asset: string | null | undefined; className?: string }) {
  return <span className={cn("num whitespace-nowrap", className)}>{formatAmount(value, asset)}</span>;
}

/** Mono 13px, truncated in the middle, copy on click, full value in the title. */
export function Identifier({ value, head = 8, tail = 6, className }: { value: string; head?: number; tail?: number; className?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard unavailable: the full value is in the title */ }
  };
  return (
    <button type="button" onClick={copy} title={value} aria-label={`Copy ${value}`} className={cn("rounded-btn font-mono text-ident text-muted transition-colors duration-150 hover:text-ink", className)}>
      {copied ? "Copied" : middle(value, head, tail)}
    </button>
  );
}

/** Overlapping 24px circles with initials and +N. Greyscale only. */
export function AvatarStack({ names, max = 4 }: { names: string[]; max?: number }) {
  const shown = names.slice(0, max);
  const extra = names.length - shown.length;
  return (
    <span className="inline-flex items-center" role="img" aria-label={`${names.length} participant${names.length === 1 ? "" : "s"}: ${names.join(", ")}`}>
      {shown.map((n, i) => (
        <span key={`${n}-${i}`} aria-hidden="true" className={cn("flex size-6 items-center justify-center rounded-full bg-ink-15 text-label font-medium text-ink ring-2 ring-card", i > 0 && "-ml-1.5")}>{(n.trim()[0] ?? "?").toUpperCase()}</span>
      ))}
      {extra > 0 ? <span className="ml-1.5 text-label text-muted">+{extra}</span> : null}
    </span>
  );
}

export interface TabItem { href: string; label: string; count?: number | null }
/** Underline tabs for page-level navigation: 14/500, active black with a 2px underline, inactive #626262. A plain number (no pill) follows a label when action is pending. */
export function PageTabs({ items, activeHref, label }: { items: TabItem[]; activeHref: string; label: string }) {
  return (
    <nav aria-label={label}>
      <ul className="flex gap-6 overflow-x-auto">
        {items.map((t) => {
          const active = t.href === activeHref;
          return (
            <li key={t.href} className="shrink-0">
              <Link href={t.href} aria-current={active ? "page" : undefined} className={cn("-mb-px inline-flex h-12 items-center gap-1.5 border-b-2 text-body font-medium transition-colors duration-150", active ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink")}>
                {t.label}
                {t.count ? <span className="num text-muted">{t.count}</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Quiet segments for filters: active filled. */
export function SegmentTabs<T extends string>({ items, value, onChange, label }: { items: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="inline-flex flex-wrap gap-1.5">
      {items.map((i) => (
        <button key={i.value} type="button" aria-pressed={value === i.value} onClick={() => onChange(i.value)} className={cn("h-9 rounded-btn px-3 text-body font-medium transition-colors duration-150", value === i.value ? "bg-button text-on-button" : "bg-ink-5 text-ink hover:bg-ink-10")}>
          {i.label}
        </button>
      ))}
    </div>
  );
}

// ---- Table (TanStack Table v9 owns the row model; this component owns the markup, sort affordance and states) ----

export interface Col<T> { id: string; header: string; cell: (row: T) => ReactNode; align?: "right"; sortable?: boolean; hideBelow?: "md" }
export interface Sort { id: string; dir: "asc" | "desc" }

const features = tableFeatures({});

export function Table<T extends RowData>({ columns, data, getRowId, loading, error, onRetry, empty, sort, onSortChange, page, pageSize, total, onPageChange, rowLabel }: {
  columns: Col<T>[]; data: T[]; getRowId: (row: T) => string; loading?: boolean; error?: string | null; onRetry?: () => void;
  empty: ReactNode; sort?: Sort | null; onSortChange?: (s: Sort) => void; page?: number; pageSize?: number; total?: number; onPageChange?: (p: number) => void; rowLabel?: string;
}) {
  const helper = createColumnHelper<typeof features, T>();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const defs = useMemo(() => columns.map((c) => helper.display({ id: c.id, header: c.header, cell: ({ row }) => c.cell(row.original) })), [columns]);
  const table = useTable({ features, columns: defs, data, getRowId });

  if (loading) return <div className="space-y-px" aria-busy="true" aria-label="Loading table">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-14 w-full rounded-none first:rounded-t-card last:rounded-b-card" />)}</div>;
  if (error) return <ErrorState title="Could not load this table" message={error} retry={onRetry ? <Button onClick={onRetry}>Try again</Button> : undefined} />;
  if (data.length === 0) return <>{empty}</>;

  const byId = new Map(columns.map((c) => [c.id, c]));
  const pages = pageSize && total ? Math.max(1, Math.ceil(total / pageSize)) : 1;
  return (
    <div>
      <div className="overflow-x-auto rounded-card bg-card">
        <table className="w-full min-w-[560px] border-collapse text-left text-body">
          <thead>
            {table.getHeaderGroups().map((g) => (
              <tr key={g.id}>
                {g.headers.map((h) => {
                  const c = byId.get(h.column.id);
                  const sorted = sort?.id === h.column.id ? sort.dir : null;
                  return (
                    <th key={h.id} scope="col" aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined} className={cn("sticky top-0 h-12 bg-card px-4 text-label font-medium uppercase tracking-wide text-muted", c?.align === "right" && "text-right", c?.hideBelow === "md" && "hidden md:table-cell")}>
                      {c?.sortable && onSortChange ? (
                        <button type="button" className="inline-flex items-center gap-1 uppercase hover:text-ink" onClick={() => onSortChange({ id: h.column.id, dir: sorted === "asc" ? "desc" : "asc" })}>
                          {c.header}<span aria-hidden="true">{sorted === "asc" ? "↑" : sorted === "desc" ? "↓" : ""}</span>
                        </button>
                      ) : c?.header}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((r) => (
              <tr key={r.id} className="h-14 border-t border-divider">
                {r.getAllCells().map((cell) => {
                  const c = byId.get(cell.column.id);
                  return (
                    <td key={cell.id} className={cn("px-4 align-middle", c?.align === "right" && "num text-right", c?.hideBelow === "md" && "hidden md:table-cell")}>
                      <table.FlexRender cell={cell} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pageSize && total !== undefined && onPageChange ? (
        <div className="mt-3 flex items-center justify-between text-body text-muted">
          <span>{rowLabel ?? "Rows"} {((page ?? 1) - 1) * pageSize + 1} to {Math.min((page ?? 1) * pageSize, total)} of {total}</span>
          <span className="flex gap-2">
            <Button size="md" disabled={(page ?? 1) <= 1} onClick={() => onPageChange((page ?? 1) - 1)}>Previous</Button>
            <Button size="md" disabled={(page ?? 1) >= pages} onClick={() => onPageChange((page ?? 1) + 1)}>Next</Button>
          </span>
        </div>
      ) : null}
    </div>
  );
}

