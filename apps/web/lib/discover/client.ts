import { createHttpClient } from "./http.ts";
import type { DiscoverClient, DiscoverResult } from "./types.ts";

export const UNAVAILABLE_REASON = "Public settlement data is not available yet.";

const unavailable = <T>(): Promise<DiscoverResult<T>> => Promise.resolve({ kind: "unavailable", reason: UNAVAILABLE_REASON });

/** A client that makes no request. Kept for tests and as the shape of a deployment without the public API. */
export const unavailableClient: DiscoverClient = {
  stats: () => unavailable(),
  settlements: () => unavailable(),
  institutions: () => unavailable(),
  assets: () => unavailable(),
};

/** The client the screen uses: the public API through this app's own proxy (GET only, no credentials needed). */
export const discover: DiscoverClient = createHttpClient();
