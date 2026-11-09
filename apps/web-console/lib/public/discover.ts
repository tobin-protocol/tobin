// Public Discover API (read-only, unauthenticated): the contract in docs/web-redesign/discover-contract.md, implemented for what the backend actually holds.
//
// What is public: ONLY organizations whose administrators chose visibility "public" when they created or updated the organization (opt-in), and only
// their name, institution type and jurisdiction. Nothing about sessions, obligations, members, wallets or amounts of any organization is ever returned.
// What is NOT published, and says so: settlements and asset use. They would need an independently read-back transaction, which the backend does not
// record (no execution reaches "confirmed" here), so those endpoints return empty pages and the statistics are null, never zero. `verifiedReadBack` can
// therefore never be true in this build.
//
// Endpoints (GET, JSON): /api/public/v1/stats, /institutions, /settlements, /assets. Cursor = opaque offset; limit 1..50 (default 20).
import type { Database } from '../db/database.ts';

export const PUBLIC_PATH = /^\/api\/public\/v1\/(stats|institutions|settlements|assets)\/?$/;
const MAX_LIMIT = 50;

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=30', 'x-content-type-options': 'nosniff' } });
const bad = (message: string): Response => json(400, { error: 'INVALID', message });

interface Row { id: string; name: string; institution_type: string | null; jurisdiction: string | null; created_at: string }

export function handlePublicDiscover(request: Request, db: Database): Response {
  if (request.method !== 'GET') return json(405, { error: 'METHOD_NOT_ALLOWED', message: 'GET only' });
  const url = new URL(request.url);
  const m = PUBLIC_PATH.exec(url.pathname);
  if (!m) return json(404, { error: 'NOT_FOUND', message: 'not found' });
  const what = m[1] as 'stats' | 'institutions' | 'settlements' | 'assets';
  const rows = db.raw.prepare("SELECT id, name, institution_type, jurisdiction, created_at FROM organizations WHERE visibility = 'public'").all() as unknown as Row[];

  if (what === 'stats') {
    return json(200, { network: 'testnet', settlementsRecorded: null, institutionsOptedIn: rows.length, assetsInUse: null, lastSettlementAt: null, note: 'Settlements are not published: none has been independently read back from the network by this backend.' });
  }

  const limit = Number(url.searchParams.get('limit') ?? 20);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) return bad(`limit must be an integer from 1 to ${MAX_LIMIT}`);
  const cursorRaw = url.searchParams.get('cursor');
  const offset = cursorRaw === null ? 0 : Number(cursorRaw);
  if (!Number.isInteger(offset) || offset < 0) return bad('cursor is not valid');

  if (what === 'settlements' || what === 'assets') {
    const sort = url.searchParams.get('sort');
    const allowed = what === 'settlements' ? ['newest', 'oldest', 'amount-high', 'amount-low'] : ['code', 'most-settlements', 'latest'];
    if (sort !== null && !allowed.includes(sort)) return bad(`sort must be one of ${allowed.join(', ')}`);
    return json(200, { network: 'testnet', items: [], nextCursor: null, note: 'Nothing is published here: no settlement has been independently read back from the network.' });
  }

  const sort = url.searchParams.get('sort') ?? 'name';
  if (!['name', 'newest'].includes(sort)) return bad('sort must be one of name, newest');
  const sorted = [...rows].sort((a, b) => (sort === 'newest' ? b.created_at.localeCompare(a.created_at) : a.name.localeCompare(b.name)) || a.id.localeCompare(b.id));
  const page = sorted.slice(offset, offset + limit);
  const next = offset + limit < sorted.length ? String(offset + limit) : null;
  return json(200, {
    network: 'testnet',
    items: page.map((r) => ({ id: r.id, displayName: r.name, ...(r.institution_type ? { institutionType: r.institution_type } : {}), ...(r.jurisdiction ? { jurisdiction: r.jurisdiction } : {}) })),
    nextCursor: next,
  });
}
