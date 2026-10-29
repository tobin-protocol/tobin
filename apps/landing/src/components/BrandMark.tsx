import { StencilText } from "./StencilText";

/** The Tobin T: a heavy T with a thin horizontal break cut through its stem (100 x 100 grid; keep in sync with scripts/build-brand-icons.mjs). */
export const T_PATH = "M0 6H100V34H68V54H32V34H0Z M32 62H68V94H32Z";

/** The T alone, in the current text colour. Decorative unless given a title. */
export function BrandMark({ size = 24, className = "" }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true" className={`shrink-0 ${className}`}>
      <path d={T_PATH} fill="currentColor" />
    </svg>
  );
}

/**
 * The lockup: the broken T, then "tobin" in the display face with the same stencil breaks as the
 * footer wordmark (cuts through each o and n). Live text in the current colour; `size` is the
 * mark's height in px and the text is set to match. Below 1024px (phones and tablets) only the T shows.
 */
export function BrandLockup({ size = 26, className = "" }: { size?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`} aria-label="Tobin" role="img">
      <BrandMark size={size} />
      <span
        aria-hidden="true"
        className="hidden font-display font-bold leading-[1.05] tracking-[-0.01em] lg:inline"
        style={{ fontSize: size * 0.95 }}
      >
        <StencilText text="tobin" />
      </span>
    </span>
  );
}
