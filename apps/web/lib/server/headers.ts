// Security headers of the public web service. The nonce-based Content-Security-Policy is built per request in proxy.ts; the static headers are served
// by next.config.ts. Pure, so they are unit-tested. The policy is not weakened globally for any integration: the Freighter extension talks to the page
// through window.postMessage, which a CSP does not govern.
export function buildCsp(nonce: string, development: boolean): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'nonce-${nonce}'`,
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src 'self'${development ? " ws: wss:" : ""}`,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

export const STATIC_SECURITY_HEADERS: readonly { key: string; value: string }[] = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=(), serial=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

/** Added only in hosted mode: browsers ignore it over plain HTTP, and the public origin is https. */
export const HSTS = { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" } as const;
