"use client";

import type { ReactNode } from "react";
import { SAMPLE_DATA } from "../../lib/tobin/index.ts";
import { CrossSessionProvider } from "../data/useCrossSession.tsx";
import { useReviewsBadge } from "./useReviewsBadge.ts";
import { SampleDataBanner } from "../ui/Surfaces.tsx";
import { HelpTile } from "./HelpTile.tsx";
import { Sidebar } from "./Sidebar.tsx";
import { TopBar } from "./TopBar.tsx";

/** The signed-in frame: 256px sidebar (a drawer under 1024px), 58px top bar, content, and the help tile. Must render inside AppGate. */
function Frame({ children }: { children: ReactNode }) {
  const pending = useReviewsBadge();
  return (
    <div className="min-h-dvh">
      {SAMPLE_DATA ? <SampleDataBanner /> : null}
      <Sidebar signedIn pending={pending} />
      <div className="flex min-h-dvh flex-col lg:pl-64">
        <TopBar signedIn pending={pending} />
        <main id="main" tabIndex={-1} className="flex-1 outline-none">{children}</main>
      </div>
      <HelpTile />
    </div>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  return <CrossSessionProvider><Frame>{children}</Frame></CrossSessionProvider>;
}

/** The signed-out frame, used by Discover: the same sidebar with every item but Discover locked, and a single Connect wallet button. */
export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh">
      <Sidebar signedIn={false} />
      <div className="flex min-h-dvh flex-col lg:pl-64">
        <TopBar signedIn={false} />
        <main id="main" tabIndex={-1} className="flex-1 outline-none">{children}</main>
      </div>
      <HelpTile />
    </div>
  );
}
