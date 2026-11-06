import { defaultDeps } from '../../../../lib/w0/deps.ts';
import { handleW0 } from '../../../../lib/w0/http.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const run = (request: Request): Promise<Response> => handleW0(request, defaultDeps());
export const GET = run;
export const POST = run;
export const DELETE = run;
