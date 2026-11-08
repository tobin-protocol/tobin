import type { ReactNode } from "react";
import { Shell } from "../../components/shell/Shell.tsx";
import { AppGate } from "../../components/shell/session.tsx";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AppGate>
      <Shell>{children}</Shell>
    </AppGate>
  );
}
