// The Tobin broken-T mark: the same path as apps/landing/src/app/icon.svg and apps/docs/components/BrandMark.tsx, drawn in currentColor. Not redrawn or
// recoloured; the Tobin name and logo are reserved (see apps/landing/NOTICE).
const T_PATH = "M0 6H100V34H68V54H32V34H0Z M32 62H68V94H32Z";

export function BrandMark({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className={className} fill="currentColor">
      <path d={T_PATH} />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="flex items-center gap-2.5">
      <span className="flex size-8 items-center justify-center rounded-btn bg-button text-on-button"><BrandMark className="size-[18px]" /></span>
      <span className="hidden text-[18px] font-medium tracking-tight sm:inline">Tobin</span>
    </span>
  );
}
