// The Console's two API endpoints as plain functions of (Request, dependencies) so that they can be tested without Next.js or a bridge.
// `app/api/*/route.ts` binds them to the real sandbox. Behaviour, status codes and bodies are those of the earlier server.
import type { InvokeOptions, PreparedCall, Transport } from 'tobin-mvp1-sdk/sdk';
import { checkRequest, readJsonBody } from './guards.ts';
import type { GuardRefusal } from './guards.ts';
import type { BootInfo } from './sandbox.ts';

export interface ApiDeps {
  sandbox: () => Promise<{ sb: { transport: Pick<Transport, 'invoke'> }; info: BootInfo }>;
  port: number;
}

const json = (status: number, value: unknown): Response =>
  new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export const refusalResponse = (r: GuardRefusal): Response => new Response(r.body, { status: r.status, headers: { 'content-type': 'text/plain', 'cache-control': 'no-store' } });

const serverError = (e: unknown): Response => json(500, { ok: false, errorType: 'Server', code: null, detail: String(e) });

function guard(request: Request, deps: ApiDeps): Response | null {
  const refusal = checkRequest({
    method: request.method,
    pathname: new URL(request.url).pathname,
    host: request.headers.get('host'),
    origin: request.headers.get('origin'),
    contentType: request.headers.get('content-type'),
    port: deps.port,
  });
  return refusal ? refusalResponse(refusal) : null;
}

export async function handleBootstrap(request: Request, deps: ApiDeps): Promise<Response> {
  const refused = guard(request, deps);
  if (refused) return refused;
  try {
    const { info } = await deps.sandbox();
    return json(200, info);
  } catch (e) {
    return serverError(e);
  }
}

export async function handleRpc(request: Request, deps: ApiDeps): Promise<Response> {
  const refused = guard(request, deps);
  if (refused) return refused;
  try {
    const { sb, info } = await deps.sandbox();
    const { call, authorize } = (await readJsonBody(request)) as { call?: PreparedCall; authorize?: InvokeOptions['authorize'] | null };
    const known = new Set([info.clearing, ...info.tokens.map((t) => t.address)]);
    if (!call || !known.has(call.contract)) return json(400, { ok: false, errorType: 'Protocol', code: null, detail: 'unknown contract' });
    const result = await sb.transport.invoke(call, authorize ? { authorize } : undefined);
    return json(200, result);
  } catch (e) {
    return serverError(e);
  }
}
