import type { ReactNode } from "react";

/** A capability the backend does not provide, drawn as a dashed box so it cannot be mistaken for data. Say what it would show and why it is absent; show nothing else. */
export function NotSupportedCard({ title, children, minHeight = "min-h-40", id }: { title: string; children: ReactNode; minHeight?: string; id?: string }) {
  return (
    <section aria-labelledby={id} className={`border border-dashed border-divider p-5 ${minHeight}`}>
      <p className="font-label text-label uppercase tracking-wider text-muted">Not supported</p>
      <h2 id={id} className="mt-1 text-entity font-medium">{title}</h2>
      <div className="mt-2 max-w-prose text-body text-muted">{children}</div>
    </section>
  );
}
