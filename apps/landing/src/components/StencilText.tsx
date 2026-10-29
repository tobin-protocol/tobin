import type { CSSProperties } from "react";

/**
 * The middle of the lower-case x-height, measured from the top of a letter box with
 * line-height 1.05 (Outfit's baseline sits 0.895em down and its x-height is about 0.49em), and
 * half the width of the gap. Both in em, so the break scales with the type.
 */
const MID = 0.65;
const HALF_GAP = 0.028;

// A vertical mask that is opaque except for a thin horizontal band at the x-height middle.
const BAND = `linear-gradient(to bottom, #000 0, #000 ${MID - HALF_GAP}em, transparent ${MID - HALF_GAP}em, transparent ${MID + HALF_GAP}em, #000 ${MID + HALF_GAP}em, #000 100%)`;
// Layers are unioned, so the gap is only where both are transparent: the band, on the right 42%.
const RIGHT = "linear-gradient(to right, #000 0, #000 58%, transparent 58%)";

// Inline styles, not a stylesheet, so the breaks do not depend on a CSS file being reloaded.
const O: CSSProperties = { display: "inline-block", WebkitMaskImage: BAND, maskImage: BAND };
const N: CSSProperties = {
  display: "inline-block",
  WebkitMaskImage: `${BAND}, ${RIGHT}`,
  maskImage: `${BAND}, ${RIGHT}`,
};

/**
 * Text with stencil breaks: each "o" is cut through the middle on both sides (its centre is
 * hollow, so a band across the whole letter only breaks the left and right strokes) and each
 * "n" on its right stem, with a thin horizontal gap. The breaks are CSS masks, so the text
 * stays live, selectable and in the page's headline face. Words are kept unbreakable so a
 * line can only wrap between words. The letters are presentational: give the parent an
 * accessible name (an aria-label) when it is a heading.
 */
export function StencilText({ text }: { text: string }) {
  return (
    <>
      {text.split(" ").map((word, w) => (
        <span key={w}>
          {w > 0 ? " " : null}
          <span className="whitespace-nowrap">
            {[...word].map((ch, i) =>
              ch === "o" || ch === "n" ? (
                <span key={i} style={ch === "o" ? O : N} aria-hidden="true">
                  {ch}
                </span>
              ) : (
                ch
              ),
            )}
          </span>
        </span>
      ))}
    </>
  );
}
