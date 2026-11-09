import type { ElementType, HTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/format.ts";

/** #f0f0f0, 24px radius: workspaces, side panels, summary blocks. */
export function Panel({ className, as: Tag = "section", ...rest }: HTMLAttributes<HTMLElement> & { as?: ElementType }) {
  return <Tag className={cn("rounded-panel bg-panel p-4 sm:p-6", className)} {...rest} />;
}

/** White, 16px radius, 16-24px padding. */
export function Card({ className, as: Tag = "div", ...rest }: HTMLAttributes<HTMLElement> & { as?: ElementType }) {
  return <Tag className={cn("rounded-card bg-card p-4 sm:p-6", className)} {...rest} />;
}

/** The one headline figure on a screen: neutral tint, 32px radius, 24px padding, hero number 48/500. */
export function DataCard({ label, value, note, className }: { label: string; value: ReactNode; note?: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-data bg-data p-6", className)}>
      <p className="text-label uppercase tracking-wide text-muted">{label}</p>
      <p className="num mt-2 text-hero font-medium">{value}</p>
      {note ? <p className="mt-2 text-body text-muted">{note}</p> : null}
    </div>
  );
}

export interface StatItem { label: string; value: ReactNode; hint?: ReactNode }
/** Three columns: 12px muted uppercase label over a 16/500 value, a hairline above each cell. */
export function StatGrid({ items, columns = 3, className }: { items: StatItem[]; columns?: 2 | 3 | 4; className?: string }) {
  return (
    <dl className={cn("grid gap-x-6 gap-y-5", columns === 4 ? "grid-cols-2 lg:grid-cols-4" : columns === 3 ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2", className)}>
      {items.map((it) => (
        <div key={it.label} className="border-t border-divider pt-3">
          <dt className="text-label uppercase tracking-wide text-muted">{it.label}</dt>
          <dd className="num mt-1 text-[16px] font-medium">{it.value}</dd>
          {it.hint ? <dd className="mt-0.5 text-label text-muted">{it.hint}</dd> : null}
        </div>
      ))}
    </dl>
  );
}

/** A full-width #f0f0f0 strip, 14px: notices that must not be missed. */
export function Banner({ children, className, role }: { children: ReactNode; className?: string; role?: "status" | "alert" | "note" }) {
  return <div role={role} className={cn("w-full bg-panel px-4 py-2.5 text-body", className)}>{children}</div>;
}

/** Shown under the header on every sensitive screen (obligation submit, approvals, settlement review, signing). */
export function TestnetStrip() {
  return <Banner role="note" className="text-center">Testnet. Test assets only. Nothing here moves real funds.</Banner>;
}

/** Persistent when NEXT_PUBLIC_TOBIN_SAMPLE_DATA=1. Sample data is never mixed with real records. */
export function SampleDataBanner() {
  return <Banner role="alert" className="text-center font-medium">Sample data. Every record below is fictional and is not from the Tobin backend.</Banner>;
}

export function DerivedNote({ shown, total, capped }: { shown: number; total: number; capped: boolean }) {
  return (
    <p className="text-label text-muted">
      Derived from session data.{" "}
      {capped ? <>Showing {shown} of {total} sessions, so these totals are not complete.</> : <>Showing all {total} session{total === 1 ? "" : "s"}.</>}
    </p>
  );
}
