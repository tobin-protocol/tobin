import { authenticateRequest } from '../../../../lib/auth/http.ts';
import { handleRegistry, json, randomSessionId } from '../../../../lib/registry/http.ts';
import { BackendUnavailable, getBackend } from '../../../../lib/server/backend.ts';
import { log, withRequestLog } from '../../../../lib/server/log.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handle(request: Request): Promise<Response> {
  try {
    const b = getBackend();
    return await handleRegistry(request, {
      registry: b.registry,
      authenticate: authenticateRequest(b.auth),
      directory: (ids) => new Map([...b.auth.summaries(ids)].map(([k, v]) => [k, { displayName: v.displayName, email: v.email, ...(v.wallet ? { wallet: v.wallet } : {}) }])),
      rate: { count: (k, w) => b.auth.rateCount(k, w), fail: (k) => b.auth.rateFail(k) },
      newSessionId: randomSessionId,
    });
  } catch (e) {
    if (e instanceof BackendUnavailable) { log('error', 'db.unavailable', { error: e }); return json(503, { error: 'BACKEND_UNAVAILABLE', message: 'The service is not available.' }); }
    log('error', 'http.internal', { error: e });
    return json(500, { error: 'INTERNAL', message: 'internal error' });
  }
}
export const GET = withRequestLog(handle);
export const POST = withRequestLog(handle);
