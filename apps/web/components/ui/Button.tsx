import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/format.ts";

export type ButtonVariant = "primary" | "secondary" | "quiet" | "destructive";

const base = "inline-flex shrink-0 items-center justify-center gap-2 rounded-btn font-medium transition-colors duration-150 ease-out-ui disabled:cursor-not-allowed aria-disabled:cursor-not-allowed";
const variants: Record<ButtonVariant, string> = {
  primary: "bg-button text-on-button hover:bg-ink disabled:bg-ink-10 disabled:text-disabled disabled:hover:bg-ink-10",
  secondary: "bg-ink-10 text-ink hover:bg-ink-15 disabled:text-disabled disabled:hover:bg-ink-10",
  quiet: "bg-ink-5 text-ink hover:bg-ink-10 disabled:text-disabled disabled:hover:bg-ink-5",
  destructive: "border border-danger-line bg-card text-danger hover:bg-ink-5 disabled:border-ink-10 disabled:text-disabled disabled:hover:bg-card",
};
const sizes = { md: "h-9 px-3 text-body", lg: "h-[52px] w-full px-4 text-action" } as const;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: keyof typeof sizes;
  /** shows a busy state and blocks repeat clicks; the label stays so nothing shifts */
  loading?: boolean;
}

export function Button({ variant = "secondary", size = "md", loading = false, className, children, disabled, type = "button", ...rest }: ButtonProps) {
  return (
    <button type={type} className={cn(base, variants[variant], sizes[size], className)} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <span aria-hidden="true" className="size-3.5 animate-pulse rounded-full bg-current opacity-60" /> : null}
      {children}
    </button>
  );
}

export function ButtonLink({ href, variant = "secondary", size = "md", className, children }: { href: string; variant?: ButtonVariant; size?: keyof typeof sizes; className?: string; children: ReactNode }) {
  return <Link href={href} className={cn(base, variants[variant], sizes[size], className)}>{children}</Link>;
}
