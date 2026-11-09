import type { ReactNode } from "react";

// Signed-out pages draw their own frame: sign-in is a split page, onboarding uses components/auth/AuthFrame.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
