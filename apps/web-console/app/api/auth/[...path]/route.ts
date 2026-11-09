import { handleAuth } from '../../../../lib/auth/http.ts';
import { json } from '../../../../lib/registry/http.ts';
import { BackendUnavailable, getBackend } from '../../../../lib/server/backend.ts';
import { log, withRequestLog } from '../../../../lib/server/log.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handle(request: Request): Promise<Response> {
  try {
    const b = getBackend();
    return await handleAuth(request, { auth: b.auth, secureCookies: b.secureCookies });
  } catch (e) {
    if (e instanceof BackendUnavailable) { log('error', 'db.unavailable', { error: e }); return json(503, { error: 'BACKEND_UNAVAILABLE', message: 'The service is not available.' }); }
    log('error', 'http.internal', { error: e });
    return json(500, { error: 'INTERNAL', message: 'internal error' });
  }
}
export const GET = withRequestLog(handle);
export const POST = withRequestLog(handle);
