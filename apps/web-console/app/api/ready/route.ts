import { withRequestLog } from '../../../lib/server/log.ts';
import { migrationStatus } from '../../../lib/db/database.ts';
import { BackendUnavailable, getBackend } from '../../../lib/server/backend.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Readiness: the database answers and the schema is at the version this build expects. It says nothing about Stellar connectivity: that is a separate,
// explicit check and is not implied by this one. No path, connection detail or user data is reported.
function handle(): Response {
  const h = { 'content-type': 'application/json', 'cache-control': 'no-store' };
  try {
    const st = migrationStatus(getBackend().db);
    const ok = st.pending.length === 0;
    return new Response(JSON.stringify({ status: ok ? 'ready' : 'not-ready', database: 'ok', schemaVersion: st.current, pendingMigrations: st.pending.length, stellar: 'not checked' }), { status: ok ? 200 : 503, headers: h });
  } catch (e) {
    return new Response(JSON.stringify({ status: 'not-ready', database: e instanceof BackendUnavailable ? 'not configured or unavailable' : 'error', stellar: 'not checked' }), { status: 503, headers: h });
  }
}

export const GET = withRequestLog(handle);
