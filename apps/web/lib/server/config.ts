// Server-side security configuration of the public web service. Pure (the environment is a parameter), so it is unit-tested.
//
// LOCAL (default): loopback origins only, no proxy secret, no forwarded address trusted. HOSTED (`TOBIN_DEPLOYMENT_MODE=hosted`): the public origin, the
// private console URL, the shared proxy secret and the number of trusted proxy hops must be configured, and development switches must be absent;
// otherwise the process refuses to start (instrumentation.ts).
//
//   TOBIN_PUBLIC_ORIGIN      the one https origin browsers use for this app (the only Origin the API proxy accepts)
//   TOBIN_API_URL            the private console URL (never a public address)
//   TOBIN_PROXY_SECRET       shared secret (at least 32 characters) sent to the console in x-tobin-proxy-auth
//   TOBIN_TRUSTED_PROXY_HOPS exactly 0 or 1: how many reverse proxies sit in front of this service and append the client address to X-Forwarded-For
export const HOSTED_MODE = "hosted";
export const MIN_PROXY_SECRET_LENGTH = 32;
export const PROXY_AUTH_HEADER = "x-tobin-proxy-auth";
export const CLIENT_IP_HEADER = "x-tobin-client-ip";

type Env = Record<string, string | undefined>;
export const isHosted = (env: Env): boolean => env.TOBIN_DEPLOYMENT_MODE === HOSTED_MODE;

export function parseOrigin(raw: string | undefined): string | null {
  if (!raw || raw.includes("*")) return null;
  try {
    const u = new URL(raw);
    const plain = u.username === "" && u.password === "" && (u.pathname === "/" || u.pathname === "") && u.search === "" && u.hash === "";
    return plain && (u.protocol === "https:" || u.protocol === "http:") && u.origin === raw.replace(/\/$/, "") ? u.origin : null;
  } catch { return null; }
}

/** The number of trusted proxy hops: 0 unless the variable is exactly "1". */
export const trustedHops = (env: Env): 0 | 1 => (env.TOBIN_TRUSTED_PROXY_HOPS === "1" ? 1 : 0);

export function hostedProblems(env: Env): string[] {
  if (!isHosted(env)) return [];
  const p: string[] = [];
  if (env.NODE_ENV !== "production") p.push("NODE_ENV must be production in hosted mode");
  const o = env.TOBIN_PUBLIC_ORIGIN ?? "";
  if (!parseOrigin(o) || !o.startsWith("https://")) p.push("TOBIN_PUBLIC_ORIGIN must be one https origin");
  const a = env.TOBIN_API_URL ?? "";
  try { const u = new URL(a); if (u.protocol !== "http:" && u.protocol !== "https:") p.push("TOBIN_API_URL must be an http(s) URL"); } catch { p.push("TOBIN_API_URL must be set to the private console URL"); }
  if ((env.TOBIN_PROXY_SECRET ?? "").length < MIN_PROXY_SECRET_LENGTH) p.push(`TOBIN_PROXY_SECRET must be at least ${MIN_PROXY_SECRET_LENGTH} characters`);
  if (env.TOBIN_TRUSTED_PROXY_HOPS !== "0" && env.TOBIN_TRUSTED_PROXY_HOPS !== "1") p.push("TOBIN_TRUSTED_PROXY_HOPS must be exactly 0 or 1");
  if (env.NEXT_PUBLIC_TOBIN_SAMPLE_DATA) p.push("NEXT_PUBLIC_TOBIN_SAMPLE_DATA must not be set (it disables access control and uses fictional data)");
  if (env.TOBIN_DEV_GALLERY) p.push("TOBIN_DEV_GALLERY must not be set (the component gallery is a development page)");
  return p;
}

/** Headers the console needs from this service in hosted mode (the shared secret). Empty in local mode. */
export function upstreamAuthHeaders(env: Env): Record<string, string> {
  return isHosted(env) && env.TOBIN_PROXY_SECRET ? { [PROXY_AUTH_HEADER]: env.TOBIN_PROXY_SECRET } : {};
}
