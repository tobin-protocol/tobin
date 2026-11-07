// Process-wide backend: the SQLite database, the Registry over it, and the AuthService. Configuration comes from the environment and FAILS CLOSED:
// a production process without TOBIN_DB_PATH (or with an in-memory path) gets no backend at all, and every request answers 503 with a safe message.
// There is no fallback to in-memory storage anywhere on this path.
import { AuthService } from '../auth/service.ts';
import type { AuthOptions } from '../auth/service.ts';
import { Database, migrate, openDatabase } from '../db/database.ts';
import { Registry } from '../registry/service.ts';
import { SqliteRegistryStore } from '../registry/sqlite-store.ts';

export class BackendUnavailable extends Error {
  constructor(message: string) { super(message); this.name = 'BackendUnavailable'; }
}

export interface Backend { db: Database; registry: Registry; auth: AuthService; secureCookies: boolean }

export interface BackendConfig { dbPath: string; secureCookies: boolean }

export function readBackendConfig(env: Record<string, string | undefined>): BackendConfig {
  const production = env['NODE_ENV'] === 'production';
  const configured = env['TOBIN_DB_PATH']?.trim();
  if (production) {
    if (!configured) throw new BackendUnavailable('TOBIN_DB_PATH is required in production');
    if (configured === ':memory:') throw new BackendUnavailable('an in-memory database is not allowed in production');
  }
  if (configured === ':memory:') return { dbPath: ':memory:', secureCookies: production };
  return { dbPath: configured || '.data/tobin-dev.sqlite', secureCookies: production };
}

/** Opens the database, applies pending migrations (each atomic) and wires the services. Throws if migration fails: the process then serves nothing. */
export function createBackend(path: string, opts: { auth?: AuthOptions; secureCookies?: boolean; clock?: { now(): Date }; clearingContract?: string } = {}): Backend {
  const db = openDatabase(path);
  try { migrate(db); } catch (e) { db.close(); throw e; }
  return { db, registry: new Registry(new SqliteRegistryStore(db), opts.clock, (() => { const c = (opts.clearingContract ?? process.env['TOBIN_STELLAR_CLEARING_CONTRACT'])?.trim(); return c && /^C[A-Z2-7]{55}$/.test(c) ? { clearingContract: c } : {}; })()), auth: new AuthService(db, opts.auth), secureCookies: opts.secureCookies ?? true };
}

const KEY = Symbol.for('tobin.backend');
const FAILED = Symbol.for('tobin.backend.failure');

/** The singleton used by the route handlers. Safe to call per request. */
export function getBackend(env: Record<string, string | undefined> = process.env): Backend {
  const g = globalThis as unknown as Record<symbol, Backend | string | undefined>;
  const existing = g[KEY] as Backend | undefined;
  if (existing) return existing;
  try {
    const cfg = readBackendConfig(env);
    const b = createBackend(cfg.dbPath, { secureCookies: cfg.secureCookies });
    g[KEY] = b;
    g[FAILED] = undefined;
    return b;
  } catch (e) {
    // The reason is logged server-side without any connection detail beyond the message; the HTTP response never includes it.
    if (g[FAILED] !== (e as Error).message) { g[FAILED] = (e as Error).message; console.error(`[tobin] backend unavailable: ${(e as Error).message}`); }
    throw e instanceof BackendUnavailable ? e : new BackendUnavailable('the backend could not be started');
  }
}
