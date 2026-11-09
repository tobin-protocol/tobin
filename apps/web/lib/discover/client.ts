import type { DiscoverClient, DiscoverResult } from "./types.ts";

export const UNAVAILABLE_REASON = "Public settlement data is not available yet.";

const unavailable = <T>(): Promise<DiscoverResult<T>> => Promise.resolve({ kind: "unavailable", reason: UNAVAILABLE_REASON });

/**
 * The only DiscoverClient that exists. It makes no request: there is no public API to call, and the app's proxy forwards nothing but /api/auth and
 * /api/registry (lib/proxy-policy.ts). Replace it with an HTTP implementation of docs/web-redesign/discover-contract.md when a backend provides one.
 */
export const unavailableClient: DiscoverClient = {
  stats: () => unavailable(),
  settlements: () => unavailable(),
  institutions: () => unavailable(),
  assets: () => unavailable(),
};

export const discover: DiscoverClient = unavailableClient;
