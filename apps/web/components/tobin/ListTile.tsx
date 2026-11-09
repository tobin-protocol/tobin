import Link from "next/link";
import type { ReactNode } from "react";

/**
 * A list tile: a #f0f0f0 block about 86px high with three lines (identifier and tag; a muted title; a value and chips). The action appears on hover AND on
 * keyboard focus, and is always visible on touch and under 768px. It stays in the tab order while hidden, so keyboard users reach it.
 */
export function ListTile({ identifier, tag, title, value, chips, href, action, actionLabel }: {
  identifier: ReactNode; tag?: ReactNode; title?: ReactNode; value?: ReactNode; chips?: ReactNode[]; href: string; action: string; actionLabel?: string;
}) {
  return (
    <li className="group relative flex min-h-[86px] flex-col justify-center gap-1 bg-tile px-4 py-3 pr-28 max-md:pr-4">
      <p className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 break-words text-body font-medium">{identifier}</span>
        {tag ? <span className="border border-divider bg-page px-2 font-label text-label uppercase tracking-wider">{tag}</span> : null}
      </p>
      {title ? <p className="text-body text-muted">{title}</p> : null}
      {value || chips?.length ? (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-body">
          {value ? <span className="num font-medium">{value}</span> : null}
          {chips?.map((c, i) => <span key={i} className="border border-divider px-2 text-label">{c}</span>)}
        </p>
      ) : null}
      <Link
        href={href}
        aria-label={actionLabel}
        className="absolute right-3 top-1/2 inline-flex h-10 -translate-y-1/2 items-center bg-ink px-4 font-label text-[14px] font-medium uppercase tracking-wide text-on-button opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100 max-md:static max-md:mt-2 max-md:h-11 max-md:w-fit max-md:translate-y-0 max-md:opacity-100 [@media(hover:none)]:opacity-100"
      >
        {action}
      </Link>
    </li>
  );
}
