import Link from "next/link";
import type { ReactNode } from "react";
import { TestnetStrip } from "../ui/Surfaces.tsx";

/** max width 1200, 24px gutters, breadcrumbs (14 muted), 28/500 title, at most one primary action on the right. */
export function PageFrame({ title, breadcrumbs, actions, sensitive, banner, children }: {
  title: string; breadcrumbs?: { href?: string; label: string }[]; actions?: ReactNode; sensitive?: boolean; /** the grain band, on Overview and Sessions only */ banner?: ReactNode; children: ReactNode;
}) {
  return (
    <>
      {banner}
      {sensitive ? <TestnetStrip /> : null}
      <div className="mx-auto w-full max-w-[1200px] px-4 pb-24 pt-6 sm:px-6 md:pb-12">
        {breadcrumbs?.length ? (
          <nav aria-label="Breadcrumb" className="mb-2 text-body text-muted">
            <ol className="flex flex-wrap gap-1.5">
              {breadcrumbs.map((b, i) => (
                <li key={b.label} className="flex items-center gap-1.5">
                  {b.href ? <Link href={b.href} className="inline-flex hover:text-ink max-md:min-h-11 max-md:items-center">{b.label}</Link> : <span>{b.label}</span>}
                  {i < breadcrumbs.length - 1 ? <span aria-hidden="true">/</span> : null}
                </li>
              ))}
            </ol>
          </nav>
        ) : null}
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <h1 className="text-title font-medium">{title}</h1>
          {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
        </div>
        {children}
      </div>
    </>
  );
}
