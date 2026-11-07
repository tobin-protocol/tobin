import { migrationStatus } from '../../../lib/db/database.ts';
import { BackendUnavailable, getBackend } from '../../../lib/server/backend.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Reports only whether the database answers and which schema version it is at. No path, no connection detail, no user data.
export function GET(): Response {
  const h = { 'content-type': 'application/json', 'cache-control': 'no-store' };
  try {
    const st = migrationStatus(getBackend().db);
    const ok = st.pending.length === 0;
    return new Response(JSON.stringify({ status: ok ? 'ok' : 'degraded', database: 'ok', schemaVersion: st.current, pendingMigrations: st.pending.length }), { status: ok ? 200 : 503, headers: h });
  } catch (e) {
    return new Response(JSON.stringify({ status: 'unavailable', database: e instanceof BackendUnavailable ? 'not configured or unavailable' : 'error' }), { status: 503, headers: h });
  }
}
