/** Tobin mark: two obligations merging into one net position. */
export function Mark({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M5 4.5l7 7.5m7-7.5L12 12m0 0v7.5" />
    </svg>
  );
}

export function Wordmark({ href = "#top" }: { href?: string }) {
  return (
    <a
      href={href}
      aria-label="Tobin, back to top"
      className="inline-flex items-center gap-2 rounded-md text-[1.1875rem] font-semibold tracking-[-0.03em]"
    >
      <Mark className="text-accent" />
      Tobin
    </a>
  );
}
