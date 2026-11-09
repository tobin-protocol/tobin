import { hostedRefusal } from '../../../../lib/server/config.ts';
import { defaultDeps } from '../../../../lib/w0/deps.ts';
import { handleW0 } from '../../../../lib/w0/http.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The W0 mock API is a development tool: a hosted console refuses it outright (proxy.ts refuses it first; this is the second line).
const run = (request: Request): Promise<Response> | Response => hostedRefusal() ?? handleW0(request, defaultDeps());
export const GET = run;
export const POST = run;
export const DELETE = run;
