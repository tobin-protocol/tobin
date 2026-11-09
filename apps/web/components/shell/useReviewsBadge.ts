"use client";

import { pendingReviews } from "../../lib/cross-session/overview.ts";
import { useCrossSession } from "../data/useCrossSession.tsx";
import { useWorkspace } from "./session.tsx";

/**
 * The count on the Reviews item. It makes NO request: it reads what a page already loaded through the cross-session hook (same cache keys), so the shell no
 * longer fans out per session. It is null until the Overview (or the Reviews page, later) has loaded that data, and only a reviewer ever has one.
 */
export function useReviewsBadge(): number | null {
  const { actor, actorKnown } = useWorkspace();
  const cs = useCrossSession({ parts: ["detail", "authorization"], passive: true });
  if (!actorKnown || !actor.reviewer) return null;
  return pendingReviews(cs.bundles, { canDecide: actor.reviewer });
}
