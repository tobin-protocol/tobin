import { authenticateRequest } from '../../../../lib/auth/http.ts';
import { handleRegistry, json, randomSessionId } from '../../../../lib/registry/http.ts';
import { BackendUnavailable, getBackend } from '../../../../lib/server/backend.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handle(request: Request): Promise<Response> {
  try {
    const b = getBackend();
    return await handleRegistry(request, {
      registry: b.registry,
      authenticate: authenticateRequest(b.auth),
      directory: (ids) => new Map([...b.auth.summaries(ids)].map(([k, v]) => [k, { displayName: v.displayName, email: v.email }])),
      rate: { count: (k, w) => b.auth.rateCount(k, w), fail: (k) => b.auth.rateFail(k) },
      newSessionId: randomSessionId,
    });
  } catch (e) {
    if (e instanceof BackendUnavailable) return json(503, { error: 'BACKEND_UNAVAILABLE', message: 'The service is not available.' });
    return json(500, { error: 'INTERNAL', message: 'internal error' });
  }
}
export const GET = handle;
export const POST = handle;
