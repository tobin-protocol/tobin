// Shared helpers for the database-backed tests: real SQLite (a temporary file or :memory:), real AuthService, real Registry. Password hashing uses a
// low scrypt cost here ONLY to keep the suite fast; production default is cost 16 (see AuthService).
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBackend } from '../lib/server/backend.ts';
import type { Backend } from '../lib/server/backend.ts';
import type { ActingUser } from '../lib/registry/identity.ts';
import { handleAuth, authenticateRequest } from '../lib/auth/http.ts';
import { handleRegistry, REQUEST_HEADER } from '../lib/registry/http.ts';

export const PASSWORD = 'correct horse battery staple';
export const SID = 'ab'.repeat(32);
export const code = (f: () => unknown) => { try { f(); } catch (e) { return (e as { code?: string }).code ?? (e as Error).message; } return 'NO_ERROR'; };
export const codeAsync = async (f: () => Promise<unknown>) => { try { await f(); } catch (e) { return (e as { code?: string }).code ?? (e as Error).message; } return 'NO_ERROR'; };

export interface Clock { t: number }
export function tempDir(): { dir: string; path: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'tobin-db-'));
  return { dir, path: join(dir, 'test.sqlite'), cleanup: () => { try { rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); } catch { /* best effort */ } } };
}

export function makeBackend(path = ':memory:', clock: Clock = { t: Date.parse('2026-11-08T10:00:00Z') }): { b: Backend; clock: Clock } {
  const b = createBackend(path, { auth: { now: () => new Date(clock.t), scryptCost: 10 }, secureCookies: true, clock: { now: () => new Date(clock.t) } });
  return { b, clock };
}

export async function newUser(b: Backend, name: string): Promise<ActingUser & { displayName: string }> {
  return b.auth.register({ email: `${name}@example.test`, password: PASSWORD, displayName: name });
}

/** Drives the real HTTP handlers with a real session cookie. */
export function client(b: Backend) {
  let cookie = '';
  const rate = { count: (k: string, w: number) => b.auth.rateCount(k, w), fail: (k: string) => b.auth.rateFail(k) };
  const call = async (method: string, path: string, body?: unknown, extra: Record<string, string> = {}, withHeader = true) => {
    const headers: Record<string, string> = { ...extra };
    if (cookie) headers['cookie'] = cookie;
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (method !== 'GET' && withHeader) headers[REQUEST_HEADER] = '1';
    const req = new Request(`http://127.0.0.1:8787${path}`, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    const res = path.startsWith('/api/auth/')
      ? await handleAuth(req, { auth: b.auth, secureCookies: true })
      : await handleRegistry(req, { registry: b.registry, authenticate: authenticateRequest(b.auth), directory: (ids) => new Map([...b.auth.summaries(ids)].map(([k, v]) => [k, { displayName: v.displayName, email: v.email }])), rate, newSessionId: () => crypto.randomUUID().replaceAll('-', '').repeat(2) });
    const set = res.headers.get('set-cookie');
    if (set) { const v = set.split(';')[0] as string; cookie = v.endsWith('=') ? '' : v; }
    return { status: res.status, headers: res.headers, body: (await res.json()) as Record<string, any> };
  };
  return { call, get cookie() { return cookie; }, set cookie(v: string) { cookie = v; } };
}

export async function signedIn(b: Backend, name: string) {
  const c = client(b);
  const r = await c.call('POST', '/api/auth/register', { email: `${name}@example.test`, password: PASSWORD, displayName: name });
  if (r.status !== 201) throw new Error(`register failed ${r.status} ${JSON.stringify(r.body)}`);
  return c;
}
