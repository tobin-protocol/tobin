import { handleBootstrap } from '../../../lib/server/api.ts';
import { defaultDeps } from '../../../lib/server/deps.ts';

// Spawns the Rust bridge on first use, so this route needs the Node.js runtime and must never be cached or prerendered.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  return handleBootstrap(request, defaultDeps());
}
