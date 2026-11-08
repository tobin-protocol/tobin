import { formatDateTime } from "../../lib/format.ts";
import { failureOf } from "../../lib/settlement/failure.ts";
import type { ExecState } from "../../lib/stages.ts";
import { CrossIcon } from "../ui/Feedback.tsx";

/** Reason, timestamp and the plain "No automatic retry" note for a stopped execution. Renders nothing for any other state. */
export function FailureNote({ state, events }: { state: ExecState | undefined; events: readonly { detail: string; at: string }[] }) {
  const f = failureOf(state, events);
  if (!f) return null;
  return (
    <div role="alert" className="rounded-card bg-card p-4">
      <p className="flex items-center gap-2 text-body font-medium text-danger"><CrossIcon />{f.title}</p>
      <p className="mt-1 text-body">{f.detail}</p>
      <p className="mt-1 text-label text-muted">{formatDateTime(f.at)}</p>
      <ul className="mt-2 space-y-1 text-label text-muted">{f.notes.map((n) => <li key={n}>{n}</li>)}</ul>
    </div>
  );
}
