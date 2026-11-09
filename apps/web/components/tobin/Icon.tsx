import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";

/** Every interface icon in the app: Hugeicons, one stroke weight, three sizes. Decorative by default; pass a label only when the icon stands alone. */
export type IconSize = 16 | 20 | 24;
export function Icon({ icon, size = 20, label, className }: { icon: IconSvgElement; size?: IconSize; label?: string; className?: string }) {
  return <HugeiconsIcon icon={icon} size={size} strokeWidth={1.5} className={className} aria-hidden={label ? undefined : true} aria-label={label} role={label ? "img" : undefined} />;
}
