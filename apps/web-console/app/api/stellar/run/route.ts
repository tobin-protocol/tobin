// Owner-run one-unit settlement (MVP-1.5 stage 5). Signed-in users only; POST with the request header. Submits only a transaction that the owner has signed in Freighter and
// confirmed by typing the exact confirmation for that step. See lib/stellar/run.ts for the enforced rules.
import { authenticateRequest } from '../../../../lib/auth/http.ts';
import { REQUEST_HEADER, json, readBody } from '../../../../lib/registry/http.ts';
import { attachEntry, prepareStep, resolveStep, runStatus, submitStep } from '../../../../lib/stellar/run.ts';
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
    const b = await readBody(request); const step = Number(b['step']);
    if (b['action'] === 'status') { const r = await runStatus(); return r.ok ? json(200, { status: r }) : json(503, { error: 'CHAIN_UNAVAILABLE', message: r.reason }); }
    if (b['action'] === 'prepare' && Number.isInteger(step)) { const r = await prepareStep(step); return r.ok ? json(200, { prepared: r.prepared }) : json(409, { error: 'REFUSED', message: r.reason }); }
    if (b['action'] === 'attach' && typeof b['hash'] === 'string' && typeof b['entryXdr'] === 'string' && Number.isInteger(Number(b['index']))) { const r = await attachEntry(b['hash'], Number(b['index']), b['entryXdr']); return r.ok ? json(200, { xdr: r.xdr, hash: r.hash }) : json(409, { error: 'REFUSED', message: r.reason }); }
    if (b['action'] === 'submit' && Number.isInteger(step) && typeof b['xdr'] === 'string' && typeof b['confirmation'] === 'string') { const r = await submitStep(step, b['xdr'], b['confirmation']); return r.ok ? json(200, { result: r }) : json(409, { error: 'REFUSED', message: r.reason }); }
    if (b['action'] === 'resolve' && Number.isInteger(step)) { const r = await resolveStep(step); return r.ok ? json(200, { result: r }) : json(409, { error: 'REFUSED', message: r.reason }); }
    return json(400, { error: 'INVALID', message: 'unknown action' });
  } catch (e) {
    if (e instanceof BackendUnavailable) return json(503, { error: 'BACKEND_UNAVAILABLE', message: 'The service is not available.' });
    return json(400, { error: 'INVALID', message: String((e as Error).message ?? e).slice(0, 160) });
  }
}
