import type { ReactNode } from "react";
import { cn } from "../../lib/format.ts";

/** The same layout as the loaded view, #f0f0f0 blocks (never a blocking spinner). */
export function Skeleton({ className, lines }: { className?: string; lines?: number }) {
  if (lines) {
    return (
      <div className="space-y-2" aria-hidden="true">
        {Array.from({ length: lines }, (_, i) => <div key={i} className={cn("h-4 animate-pulse rounded-btn bg-panel", i === lines - 1 && "w-2/3", className)} />)}
      </div>
    );
  }
  return <div aria-hidden="true" className={cn("animate-pulse rounded-card bg-panel", className ?? "h-20 w-full")} />;
}

/** Same size as the filled state. Values read "No data", never 0. */
export function EmptyState({ title = "No data", message, action, className }: { title?: string; message: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-h-40 flex-col items-start justify-center gap-2 rounded-card bg-panel p-6", className)}>
      <p className="text-entity font-medium text-muted">{title}</p>
      <p className="max-w-prose text-body text-muted">{message}</p>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

/** A feature the backend does not provide (decision D3). #626262 text, never mocked data. */
export function NotSupported({ feature, reason, className, tone = "panel" }: { feature: string; reason: ReactNode; className?: string; tone?: "panel" | "card" }) {
  return (
    <div className={cn("rounded-card p-6", tone === "panel" ? "bg-panel" : "bg-card", className)} role="note">
      <p className="flex items-center gap-2 text-entity font-medium text-muted">
        <svg aria-hidden="true" viewBox="0 0 16 16" className="size-4"><path d="M3 8h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none" /></svg>
        Not supported
      </p>
      <p className="mt-2 text-body font-medium">{feature}</p>
      <p className="mt-1 max-w-prose text-body text-muted">{reason}</p>
    </div>
  );
}

/** A disabled control with its inline reason. Do not rely on hiding buttons alone. */
export function PermissionState({ reason, children }: { reason: string | null; children: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-1.5">
      {children}
      {reason ? <p className="max-w-xs text-label text-muted" role="note">{reason}</p> : null}
    </div>
  );
}

/** Whole-page denial: who can grant access, in plain language. */
export function AccessDenied({ title, message }: { title: string; message: ReactNode }) {
  return (
    <div className="rounded-panel bg-panel p-6" role="alert">
      <p className="text-entity font-medium">{title}</p>
      <p className="mt-2 max-w-prose text-body text-muted">{message}</p>
    </div>
  );
}

/** Failure, refusal, rejection: red text and a cross icon. The only place red appears besides destructive confirmation. */
export function ErrorState({ title, message, retry }: { title: string; message: ReactNode; retry?: ReactNode }) {
  return (
    <div className="rounded-card bg-panel p-6" role="alert">
      <p className="flex items-center gap-2 text-entity font-medium text-danger"><CrossIcon />{title}</p>
      <p className="mt-2 max-w-prose text-body">{message}</p>
      {retry ? <div className="mt-3">{retry}</div> : null}
    </div>
  );
}

export function InlineError({ children, id }: { children: ReactNode; id?: string }) {
  return <p id={id} role="alert" className="mt-1.5 flex items-start gap-1.5 text-body text-danger"><CrossIcon />{children}</p>;
}

export function CrossIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className={cn("mt-0.5 size-4 shrink-0", className)}>
      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export type StatusKind = "progress" | "done" | "action" | "failed" | "unsupported";

/** Status is a dot or icon plus text, never a pill or a hue. There is deliberately no on-chain-success kind: only the stage rail can show that, and only after a verified read-back. */
export function StatusMark({ kind, children }: { kind: StatusKind; children: ReactNode }) {
  if (kind === "failed") return <span className="inline-flex items-center gap-1.5 text-body text-danger"><CrossIcon className="mt-0" />{children}</span>;
  if (kind === "unsupported") return <span className="inline-flex items-center gap-1.5 text-body text-muted">{children}</span>;
  const dot =
    kind === "progress" ? <span aria-hidden="true" className="size-2 rounded-full border border-muted" />
    : <span aria-hidden="true" className="size-2 rounded-full bg-button" />;
  return (
    <span className={cn("inline-flex items-center gap-2 text-body", kind === "progress" ? "text-muted" : "text-ink", kind === "action" && "font-medium")}>
      {dot}{children}
    </span>
  );
}
