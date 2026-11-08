// Two small, true diagrams drawn as HTML: the contract lifecycle and the stages a transaction must never be confused
// with each other. Both come from the architecture pages.

const STATES = [
  { name: "OPEN", text: "Participants join and debtors submit obligations." },
  { name: "COMMITTED", text: "Obligations are frozen. A proposal can be made and replaced." },
  { name: "APPROVED", text: "Every participant approved the current digest." },
  { name: "SETTLED", text: "settle ran atomically, once." },
];

export function Lifecycle() {
  return (
    <ol className="relative grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {STATES.map((s, i) => {
        const last = i === STATES.length - 1;
        return (
          <li
            key={s.name}
            className="relative rounded-[16px] border border-fd-border bg-fd-card p-5"
          >
            <span className="flex items-center gap-2 font-label text-xs uppercase tracking-[0.1em] text-fd-muted-foreground">
              <span
                aria-hidden="true"
                className="inline-block size-2 rounded-full"
                style={{ background: last ? "var(--color-fd-success)" : "var(--color-fd-muted-foreground)" }}
              />
              {String(i + 1).padStart(2, "0")}
            </span>
            <p className="mt-3 font-heading text-xl font-medium tracking-[-0.01em]">{s.name}</p>
            <p className="mt-1 text-sm text-fd-muted-foreground">{s.text}</p>
          </li>
        );
      })}
    </ol>
  );
}

const STAGES = [
  { name: "Prepared", text: "An application record. Nothing signed." },
  { name: "Signed", text: "A signature exists. Not proof of submission." },
  { name: "Submitted", text: "The network accepted it for inclusion." },
  { name: "Confirmed", text: "Read back from the network by hash." },
  { name: "Reconciled", text: "Matches the approved batch exactly." },
];

export function Stages() {
  return (
    <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {STAGES.map((s, i) => {
        const last = i === STAGES.length - 1;
        return (
          <li
            key={s.name}
            className="relative rounded-[16px] border p-4"
            style={{
              borderColor: last ? "var(--color-fd-success)" : "var(--color-fd-border)",
              background: "var(--color-fd-background)",
            }}
          >
            <p className="font-heading text-lg font-medium">{s.name}</p>
            <p className="mt-1 text-sm text-fd-muted-foreground">{s.text}</p>
            {!last && (
              <span
                aria-hidden="true"
                className="absolute -right-2.5 top-1/2 z-10 hidden size-5 -translate-y-1/2 items-center justify-center rounded-full border border-fd-border bg-fd-background text-xs text-fd-muted-foreground lg:flex"
              >
                →
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
