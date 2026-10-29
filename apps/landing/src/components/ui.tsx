import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { ArrowRight02Icon } from "@hugeicons/core-free-icons";
import type { ReactNode } from "react";

/** Content column: up to 94.5rem (1512px), 22px gutters on phones, 44px on desktop. */
export function Container({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`mx-auto w-full max-w-[94.5rem] px-[22px] md:px-[44px] ${className}`}>
      {children}
    </div>
  );
}

type Tone = "light" | "grey" | "dark";

const toneClass: Record<Tone, string> = {
  light: "surface-light",
  grey: "surface-grey",
  dark: "surface-dark",
};

/** A section with its ground and 80 to 120px of vertical padding. */
export function Section({
  id,
  labelledBy,
  tone,
  className = "",
  children,
}: {
  id?: string;
  labelledBy: string;
  tone: Tone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      data-surface={tone === "dark" ? "dark" : undefined}
      className={`${toneClass[tone]} py-16 md:py-20 xl:py-[120px] ${className}`}
    >
      {children}
    </section>
  );
}

type Variant = "dark" | "light" | "glass";

const variantClass: Record<Variant, string> = {
  dark: "btn-dark",
  light: "btn-light",
  glass: "btn-glass",
};

/** Anchor styled as a button. External URLs open in a new tab. */
export function ButtonLink({
  href,
  variant = "dark",
  children,
  className = "",
}: {
  href: string;
  variant?: Variant;
  children: ReactNode;
  className?: string;
}) {
  const external = /^https?:\/\//.test(href);
  return (
    <a
      href={href}
      className={`btn ${variantClass[variant]} ${className}`}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      {children}
      {external ? <span className="sr-only"> (opens in a new tab)</span> : null}
    </a>
  );
}

/** Visible, non-interactive stand-in for a destination that is not known yet. */
export function PendingLink({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex min-h-11 items-center gap-2 text-[1rem] font-medium text-(--soft)">
      {children}
      <span className="btn-pending-tag">Link pending</span>
    </span>
  );
}

/** Eyebrow above a heading: plain text. */
export function Eyebrow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`eyebrow ${className}`}>{children}</p>;
}

export function Arrow({ className = "" }: { className?: string }) {
  return <HugeiconsIcon icon={ArrowRight02Icon} size={16} strokeWidth={1.5} aria-hidden="true" className={className} />;
}

/** 24px line icon, 1.5px stroke, from Hugeicons (stroke rounded). */
export function Icon({ icon }: { icon: IconSvgElement }) {
  return <HugeiconsIcon icon={icon} size={24} strokeWidth={1.5} aria-hidden="true" />;
}
