import { handleRpc } from '../../../lib/server/api.ts';
import { defaultDeps } from '../../../lib/server/deps.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  return handleRpc(request, defaultDeps());
}
