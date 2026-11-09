// The web service's structured log is the same module as the console's; its redaction is checked here as well because it logs the browser-facing requests.
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { log, requestIdOf, routeLabel, setLogWriter, withRequestLog } from "../lib/server/log.ts";

afterEach(() => setLogWriter());

test("sensitive fields never reach a web log line", () => {
  const lines: string[] = [];
  setLogWriter((_l, line) => lines.push(line));
  log("warn", "csrf.refused", { cookie: "tobin_session=abcdef", password: "hunter2hunter2", signature: "c2ln", email: "p@example.org", note: "token " + "z".repeat(40), status: 403 });
  const line = lines[0] as string;
  for (const n of ["abcdef", "hunter2", "c2ln", "p@example.org", "zzzzzzzzzz"]) assert.ok(!line.includes(n), n);
  const o = JSON.parse(line);
  assert.equal(o.service, "web");
  assert.equal(o.status, 403);
});

test("request logging labels routes without ids, echoes one stable request id and keeps the body intact", async () => {
  const lines: string[] = [];
  setLogWriter((_l, line) => lines.push(line));
  let seen = "";
  const res = await withRequestLog(async (req: Request) => { seen = requestIdOf(req); return new Response(JSON.stringify({ error: "CSRF_ORIGIN" }), { status: 403 }); })(new Request("http://x/api/registry/orgs/org_secret/sessions/abc/calculate", { method: "POST" }), undefined);
  const o = JSON.parse(lines[0] as string);
  assert.equal(o.route, "/api/registry/orgs/:id/sessions/:id/calculate");
  assert.equal(o.requestId, seen, "the handler and the log share one id");
  assert.equal(res.headers.get("x-request-id"), seen);
  assert.equal(o.failure, "CSRF_ORIGIN");
  assert.equal((await res.json()).error, "CSRF_ORIGIN");
  assert.equal(routeLabel("/api/auth/login"), "/api/auth/login");
});
