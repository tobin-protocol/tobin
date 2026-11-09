import { handlePublicDiscover } from '../../../../lib/public/discover.ts';
import { BackendUnavailable, getBackend } from '../../../../lib/server/backend.ts';
import { log, withRequestLog } from '../../../../lib/server/log.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Public, read-only Discover data (see lib/public/discover.ts for exactly what is and is not published).
function handle(request: Request): Response {
  try {
    return handlePublicDiscover(request, getBackend().db);
  } catch (e) {
    if (e instanceof BackendUnavailable) { log('error', 'db.unavailable', { error: e }); return new Response(JSON.stringify({ error: 'BACKEND_UNAVAILABLE', message: 'The service is not available.' }), { status: 503, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } }); }
    log('error', 'http.internal', { error: e });
    return new Response(JSON.stringify({ error: 'INTERNAL', message: 'internal error' }), { status: 500, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
  }
}
export const GET = withRequestLog(handle);
export const POST = withRequestLog(handle);
