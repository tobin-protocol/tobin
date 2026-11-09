// Same module as apps/web-console/lib/server/log.ts (kept in step by hand: the two apps share no package). Structured logging: one JSON object per line on stdout (info, warn) or stderr (error), so the platform log collector can parse it. Pure apart from the
// write, and the writer is injectable so the redaction rules are unit-tested.
//
// NEVER logged: passwords, session tokens, cookies, authorization values, private or secret keys, seed phrases, raw signatures, invitation codes or
// other credentials, e-mail addresses. Field NAMES that look sensitive are replaced by "[redacted]" wherever they appear (any depth); long free-text
// values are truncated; error messages are scrubbed of anything that looks like a token or a Stellar secret key.
import { randomUUID } from "node:crypto";

export type Level = "info" | "warn" | "error";
export type Fields = Record<string, unknown>;

const SENSITIVE_NAME = /pass(word|phrase)?|secret|token|cookie|authorization|auth-?header|signature|signed|seed|mnemonic|private|credential|invitation|invite|code|session(id)?$|^key$|apikey|api-key|bearer|email|proof|challenge-?message/i;
const MAX_STRING = 200;

/** Replaces sensitive-looking substrings inside a free-text value. */
export function scrubText(v: string): string {
  return v
    .replace(/\bS[A-Z2-7]{55}\b/g, "[redacted-stellar-secret]")
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, "[redacted-long-token]")
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[redacted-email]");
}

export function redact(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") { const s = scrubText(value); return s.length > MAX_STRING ? s.slice(0, MAX_STRING) + "..." : s; }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Error) return { name: value.name, message: redact(value.message) };
  if (depth >= 4) return "[truncated]";
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redact(v, depth + 1));
  if (typeof value === "object") {
    const out: Fields = {};
    for (const [k, v] of Object.entries(value as Fields)) {
      // a well-formed request id (a UUID or similar) is an opaque correlation value, not a credential: it must survive the long-token scrub
      if (k === "requestId" && typeof v === "string" && /^[A-Za-z0-9._-]{8,64}$/.test(v)) out[k] = v;
      else out[k] = SENSITIVE_NAME.test(k) ? "[redacted]" : redact(v, depth + 1);
    }
    return out;
  }
  return "[unsupported]";
}

export type Writer = (level: Level, line: string) => void;
let writer: Writer = (level, line) => { (level === "error" ? process.stderr : process.stdout).write(line + "\n"); };
/** Tests replace the writer; pass nothing to restore the default. */
export function setLogWriter(w?: Writer): void {
  writer = w ?? ((level, line) => { (level === "error" ? process.stderr : process.stdout).write(line + "\n"); });
}

export function log(level: Level, event: string, fields: Fields = {}): void {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, event, service: "web", ...(redact(fields) as Fields) });
  try { writer(level, line); } catch { /* logging must never break a request */ }
}

const REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/;
/** The request id sent by the web service when it is well formed, otherwise a new one. */
const ids = new WeakMap<Request, string>();
export const requestIdOf = (request: Request): string => {
  const known = ids.get(request);
  if (known) return known;
  const h = request.headers.get("x-request-id");
  const id = h && REQUEST_ID.test(h) ? h : randomUUID();
  ids.set(request, id);
  return id;
};

/** A route label with identifiers masked, so logs group by endpoint and never carry ids, codes or keys in the path. */
export function routeLabel(pathname: string): string {
  return pathname
    .split("/")
    .map((seg, i) => (i < 4 || /^(sessions|members|invitations|reviewers|participants|obligations|batches|attempts|wallets|wallet|orgs|calculate|calculation|authorization|settlement|execution|approve|reject|void|ready|reopen|close|update|role|remove|status|revoke|grant|accept|validation|readiness|signer-sets|wallet-challenges|wallet-verifications|verify|prepare|start|begin|discover|assets|me|audit|login|register|logout|logout-all|profile|workspace|renew|onboarding|default-org|challenge|link|health|live|ready)$/.test(seg) || seg === "" ? seg : ":id"))
    .join("/");
}

type Handler<C> = (request: Request, ctx: C) => Promise<Response> | Response;

/** Wraps a route handler: request id (echoed in the response), route label, status, duration, and the error CODE of a refusal. Never the body. */
export function withRequestLog<C>(handler: Handler<C>): Handler<C> {
  return async (request, ctx) => {
    const started = performance.now();
    const requestId = requestIdOf(request);
    const url = new URL(request.url);
    let res: Response;
    try {
      res = await handler(request, ctx);
    } catch (e) {
      log("error", "http.unhandled", { requestId, method: request.method, route: routeLabel(url.pathname), error: e });
      return new Response(JSON.stringify({ error: "INTERNAL", message: "internal error" }), { status: 500, headers: { "content-type": "application/json", "cache-control": "no-store", "x-request-id": requestId } });
    }
    let errorCode: string | undefined;
    if (res.status >= 400) {
      try { const b = (await res.clone().json()) as { error?: unknown }; if (typeof b.error === "string") errorCode = b.error.slice(0, 40); } catch { /* not JSON */ }
    }
    const level: Level = res.status >= 500 ? "error" : res.status === 401 || res.status === 403 || res.status === 429 ? "warn" : "info";
    const refusal = res.status === 401 || res.status === 403 || res.status === 429;
    log(level, refusal ? "http.refused" : "http.request", { requestId, method: request.method, route: routeLabel(url.pathname), status: res.status, durationMs: Math.round(performance.now() - started), ...(errorCode ? { failure: errorCode } : {}) });
    const headers = new Headers(res.headers);
    headers.set("x-request-id", requestId);
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  };
}
