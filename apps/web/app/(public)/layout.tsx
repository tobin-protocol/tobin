import { headers } from "next/headers";
import type { ReactNode } from "react";
import { PublicShell, Shell } from "../../components/shell/Shell.tsx";
import { AppGate } from "../../components/shell/session.tsx";

/** Public pages. proxy.ts validated the session on the server and set x-tobin-auth; a signed-in visitor gets the full app frame, a signed-out one the locked sidebar. */
export default async function PublicLayout({ children }: { children: ReactNode }) {
  const signedIn = (await headers()).get("x-tobin-auth") === "in";
  if (signedIn) return <AppGate><Shell>{children}</Shell></AppGate>;
  return <PublicShell>{children}</PublicShell>;
}
