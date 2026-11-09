"use client";

import { reviewsBadge } from "../../lib/cross-session/reviews.ts";
import { useCrossSession } from "../data/useCrossSession.tsx";
import { useWorkspace } from "./session.tsx";

/**
 * The count on the Reviews item. It makes NO request: it reads what a page already loaded through the cross-session hook (the same per-session queries the
 * Reviews page and the Overview use) and counts "My reviews" with the SAME function the Reviews page uses, calculations and settlement batches together. It is
 * null until a page has loaded the authorizations and the settlement lists of the sessions in the window, and for anyone who is not a reviewer.
 */
export function useReviewsBadge(): number | null {
  const { me, actor, actorKnown } = useWorkspace();
  const cs = useCrossSession({ parts: ["authorization", "settlement"], passive: true });
  if (!actorKnown || !actor.reviewer) return null;
  return reviewsBadge(cs.bundles, { reviewer: actor.reviewer, displayName: me.user.displayName }, cs.window.length);
}
