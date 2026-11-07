// Owner-run co-signing test (MVP-1.5 stage 4). Signed-in users only; POST with the request header; reads the live chain; nothing is submitted.
import { authenticateRequest } from '../../../../lib/auth/http.ts';
import { REQUEST_HEADER, json, readBody } from '../../../../lib/registry/http.ts';
import { prepareCosign, verifyCosign } from '../../../../lib/stellar/cosign.ts';
import { ownerToolsAllowed } from '../../../../lib/stellar/owner-access.ts';
import { BackendUnavailable, getBackend } from '../../../../lib/server/backend.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  try {
    if (request.headers.get(REQUEST_HEADER) !== '1') return json(403, { error: 'FORBIDDEN', message: 'missing request header' });
    const user = await authenticateRequest(getBackend().auth)(request);
    if (!user) return json(401, { error: 'UNAUTHENTICATED', message: 'Sign in to continue.' });
    if (!ownerToolsAllowed(user)) return json(403, { error: 'FORBIDDEN', message: 'This tool is restricted to the signers of the administrative account and the configured second account.' });
    const b = await readBody(request);
    if (b['action'] === 'prepare') { const r = await prepareCosign(); return r.ok ? json(200, { prepared: r.prepared }) : json(503, { error: 'CHAIN_UNAVAILABLE', message: r.reason }); }
    if (b['action'] === 'verify' && typeof b['xdr'] === 'string') { const r = await verifyCosign(b['xdr']); return r.ok ? json(200, { result: r.result }) : json(409, { error: 'NOT_VERIFIED', message: r.reason }); }
    return json(400, { error: 'INVALID', message: 'action must be prepare or verify' });
  } catch (e) {
    if (e instanceof BackendUnavailable) return json(503, { error: 'BACKEND_UNAVAILABLE', message: 'The service is not available.' });
    return json(400, { error: 'INVALID', message: String((e as Error).message ?? e).slice(0, 160) });
  }
}
