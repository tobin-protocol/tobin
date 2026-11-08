"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import { Button } from "../ui/Button.tsx";
import { ApiError } from "../../lib/api/http.ts";
import { DEFAULT_QUERY, parseQuery, serializeQuery, type ListQuery } from "../../lib/sessions/list.ts";

/** The sessions-list query, held in the URL (shareable, survives reload). Defaults are omitted. */
export function useListQuery(): [ListQuery, (patch: Partial<ListQuery>) => void] {
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const query = parseQuery(params);
  const set = useCallback((patch: Partial<ListQuery>) => {
    // any change except paging itself returns to the first page
    const next = { ...query, ...("page" in patch ? {} : { page: 1 }), ...patch };
    router.replace(`${path}${serializeQuery(next)}`, { scroll: false });
  }, [query, router, path]);
  return [query, set];
}
export { DEFAULT_QUERY };

/** Copies a value and says so in words (a live region), because a colour or icon change alone is not enough. */
export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const copy = async () => {
    try { await navigator.clipboard.writeText(value); setState("copied"); } catch { setState("failed"); }
    setTimeout(() => setState("idle"), 2500);
  };
  return (
    <span className="inline-flex items-center gap-2">
      <Button onClick={copy}>{label}</Button>
      <span role="status" className="text-label text-muted">{state === "copied" ? "Copied" : state === "failed" ? "Could not copy. Select the id and copy it by hand." : ""}</span>
    </span>
  );
}

/** The server's message is the reason; a code is never shown on its own. */
export const reasonOf = (e: unknown): string => (e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Something went wrong. Try again.");
