import { useId } from "react";
import { ART, type Art } from "./logo-art";

/**
 * Tobin logo, inlined from the brand pack (see scripts/build-logo-art.mjs).
 *
 * Usage rules from the pack:
 * - symbol minimum 16px (enforced below); clear space about 19% of the symbol height;
 * - never stretch, rotate or recolour the wordmark (it is live JetBrains Mono text, set by
 *   scripts/build-logo-art.mjs, so it needs the site's font to render as designed);
 * - the glossy symbol only on a near-black or near-white ground, otherwise use `flat`.
 *
 * theme: the ground the logo sits on. "light" = light ground, "dark" = dark ground,
 * "auto" = follows prefers-color-scheme (renders both and lets CSS pick, so the
 * markup is identical on server and client).
 */
export type LogoProps = {
  variant?: "lockup" | "symbol";
  theme?: "light" | "dark" | "auto";
  /** Single-colour version: black on light, white on dark. Symbol uses currentColor. */
  flat?: boolean;
  /** Rendered height in px. Omit to size with className (width follows the aspect ratio). */
  height?: number;
  className?: string;
  /** Accessible name. */
  title?: string;
  /** Hide from assistive tech (use when a parent link already carries the name). */
  decorative?: boolean;
};

const MIN_SYMBOL = 16;

function pick(variant: "lockup" | "symbol", theme: "light" | "dark", flat: boolean): Art {
  if (variant === "symbol") return flat ? ART.symbolFlat : ART.symbolGlossy;
  if (theme === "dark") return flat ? ART.lockupWhite : ART.lockupDark;
  return flat ? ART.lockupBlack : ART.lockupLight;
}

function Svg({
  art,
  uid,
  height,
  className,
  title,
  decorative,
  style,
}: {
  art: Art;
  uid: string;
  height?: number;
  className?: string;
  title: string;
  decorative: boolean;
  style?: React.CSSProperties;
}) {
  const inner = art.inner.replaceAll("__IRI__", `${uid}-iri`).replaceAll("__HL__", `${uid}-hl`);
  const size =
    height === undefined
      ? undefined
      : { height, width: Math.round((height * art.w * 100) / art.h) / 100 };
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${art.w} ${art.h}`}
      {...(size ?? {})}
      className={className}
      style={style}
      {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": title })}
      focusable="false"
      dangerouslySetInnerHTML={{ __html: inner }}
    />
  );
}

export function Logo({
  variant = "lockup",
  theme = "auto",
  flat = false,
  height,
  className = "",
  title = "Tobin",
  decorative = false,
}: LogoProps) {
  // useId output can contain characters that are awkward inside url(#...).
  const uid = `tobin${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const h = variant === "symbol" && height !== undefined ? Math.max(height, MIN_SYMBOL) : height;
  const base = `block shrink-0 ${className}`;

  if (theme === "auto") {
    // Flat symbol is a single colour: core on light grounds, paper on dark ones.
    const flatSymbol = variant === "symbol" && flat;
    return (
      <>
        <Svg
          art={pick(variant, "light", flat)}
          uid={`${uid}l`}
          height={h}
          className={`${base} dark:hidden ${flatSymbol ? "text-core" : ""}`}
          title={title}
          decorative={decorative}
        />
        <Svg
          art={pick(variant, "dark", flat)}
          uid={`${uid}d`}
          height={h}
          className={`${base} hidden dark:block ${flatSymbol ? "text-paper" : ""}`}
          title={title}
          decorative={decorative}
        />
      </>
    );
  }

  const flatSymbol = variant === "symbol" && flat;
  return (
    <Svg
      art={pick(variant, theme, flat)}
      uid={uid}
      height={h}
      className={`${base} ${flatSymbol ? (theme === "dark" ? "text-paper" : "text-core") : ""}`}
      title={title}
      decorative={decorative}
    />
  );
}
