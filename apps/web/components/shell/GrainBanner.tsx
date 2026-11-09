import { bannerHeadline } from "../../lib/shell/banner.ts";

/**
 * The band at the top of Overview and Sessions: about 110px, greyscale, with fine grain made in CSS (an inline SVG noise filter: no image asset) and one large
 * headline in the landing's display face. The headline carries a REAL count ("SESSIONS: 24") or says NO DATA when the count is unavailable. Square ink-10% blocks
 * in the corners; no colour.
 */
const GRAIN = "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.5 0'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.35'/></svg>\")";

export function GrainBanner({ label, count }: { label: string; count: number | null | undefined }) {
  const text = bannerHeadline(label, count);
  return (
    <div role="group" aria-label={text} className="relative flex h-[110px] items-center overflow-hidden bg-data px-4 sm:px-6" style={{ backgroundImage: GRAIN }}>
      <span aria-hidden="true" className="absolute left-0 top-0 size-4 bg-ink-10" />
      <span aria-hidden="true" className="absolute bottom-0 right-0 size-4 bg-ink-10" />
      <p aria-hidden="true" className="font-display text-[clamp(32px,6vw,64px)] font-medium uppercase leading-none tracking-tight">{text}</p>
    </div>
  );
}
