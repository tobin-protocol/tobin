"use client";

// Hands the per-request Content-Security-Policy nonce (set by proxy.ts) to the browser-side libraries that insert <style> elements themselves. Radix's
// scroll lock (react-remove-scroll) adds a style element whenever a modal opens, and it reads the nonce from the `__webpack_nonce__` global; without
// it the policy refuses that element. The global is the documented hook those libraries use: no dependency is added and the policy is not relaxed.
export function NonceBridge({ nonce }: { nonce: string | null }) {
  if (nonce && typeof window !== "undefined") (window as unknown as { __webpack_nonce__?: string }).__webpack_nonce__ = nonce;
  return null;
}
