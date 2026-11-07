// Owner-run Freighter validation material (MVP-1.5). Signed-in users only; POST with the request header; read-only Testnet reads; nothing is submitted.
import { authenticateRequest } from '../../../../lib/auth/http.ts';
import { REQUEST_HEADER, json, readBody } from '../../../../lib/registry/http.ts';
import { prepareOwnerValidation } from '../../../../lib/stellar/owner-validation.ts';
import { BackendUnavailable, getBackend } from '../../../../lib/server/backend.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  try {
    if (request.headers.get(REQUEST_HEADER) !== '1') return json(403, { error: 'FORBIDDEN', message: 'missing request header' });
    const user = await authenticateRequest(getBackend().auth)(request);
    if (!user) return json(401, { error: 'UNAUTHENTICATED', message: 'Sign in to continue.' });
    const b = await readBody(request);
    if (typeof b['account'] !== 'string') return json(400, { error: 'INVALID', message: 'account is required' });
    return json(200, { material: await prepareOwnerValidation(b['account']) });
  } catch (e) {
    if (e instanceof BackendUnavailable) return json(503, { error: 'BACKEND_UNAVAILABLE', message: 'The service is not available.' });
    return json(400, { error: 'INVALID', message: String((e as Error).message ?? e).slice(0, 160) });
  }
}
