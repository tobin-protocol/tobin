export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Liveness: the process answers. It touches no database and calls no network, so it is cheap and cannot fail because a dependency is down.
export function GET(): Response {
  return new Response(JSON.stringify({ status: 'ok' }), { status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}
