import { notFound } from "next/navigation";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

/** The component gallery is a development tool. It answers only in development, or when TOBIN_DEV_GALLERY=1 is set at start-up (the smoke tests do). It shows fictional values and calls no backend. */
export default function DevLayout({ children }: { children: ReactNode }) {
  if (process.env.NODE_ENV === "production" && process.env.TOBIN_DEV_GALLERY !== "1") notFound();
  return <>{children}</>;
}
