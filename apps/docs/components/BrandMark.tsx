// The Tobin broken-T mark: the same path as apps/landing/src/app/icon.svg and BrandMark.tsx, drawn in
// currentColor so it follows the theme. Not redrawn or recoloured; the name and logo are reserved (see
// apps/landing/NOTICE).
const T_PATH = "M0 6H100V34H68V54H32V34H0Z M32 62H68V94H32Z";

export function BrandMark({ className = "size-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className={className} fill="currentColor">
      <path d={T_PATH} />
    </svg>
  );
}

export function Brand() {
  return (
    <span className="flex items-center gap-2.5">
      <span className="flex size-8 items-center justify-center rounded-[8px] bg-[var(--color-ink-soft)] text-white dark:bg-[var(--color-paper)] dark:text-[var(--color-ink)]">
        <BrandMark className="size-[18px]" />
      </span>
      <span className="font-heading text-[1.05rem] font-medium leading-none tracking-[-0.02em]">
        Tobin <span className="text-fd-muted-foreground">Docs</span>
      </span>
    </span>
  );
}
