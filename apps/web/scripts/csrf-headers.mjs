// Headers a real browser sends with a same-origin write, for scripts that call the API proxy through Playwright's request context (which sends neither).
// The proxy validates Origin and x-tobin-request (lib/server/csrf.ts); scripts supply them explicitly instead of the proxy inventing them.
export const csrf = (base) => ({ origin: new URL(base).origin, "x-tobin-request": "1" });
