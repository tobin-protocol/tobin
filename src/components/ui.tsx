import type { ReactNode } from "react";

export function Container({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`mx-auto w-full max-w-[72rem] px-5 sm:px-8 ${className}`}>
      {children}
    </div>
  );
}

type Variant = "primary" | "secondary" | "light" | "outline-light";

const variantClass: Record<Variant, string> = {
  primary: "btn-primary",
  secondary: "btn-secondary",
  light: "btn-light",
  "outline-light": "btn-outline-light",
};

/** Anchor styled as a button. External URLs open in a new tab. */
export function ButtonLink({
  href,
  variant = "primary",
  small = false,
  children,
  className = "",
}: {
  href: string;
  variant?: Variant;
  small?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const external = /^https?:\/\//.test(href);
  return (
    <a
      href={href}
      className={`btn ${variantClass[variant]} ${small ? "btn-sm" : ""} ${className}`}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      {children}
    </a>
  );
}

/** Visible, non-interactive stand-in for a destination that is not known yet. */
export function PendingLink({ children }: { children: ReactNode }) {
  return (
    <span className="btn btn-pending">
      {children}
      <span className="btn-pending-tag">Link pending</span>
    </span>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  children,
  className = "",
}: {
  eyebrow: string;
  title: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="eyebrow">{eyebrow}</p>
      <h2 className="text-title mt-4 text-balance">{title}</h2>
      {children ? <p className="text-lead mt-5 max-w-[34rem]">{children}</p> : null}
    </div>
  );
}

export function Arrow({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M3 8h10M9 4l4 4-4 4" />
    </svg>
  );
}
