// The store factory of the registry conformance suite (test/registry-conformance.suite.ts). A harness opens a fresh, empty backend on ONE kind of store and
// exposes the few store-level operations the suite needs that the domain API deliberately does not offer: raw mutation attempts (to prove immutability),
// row counts (to prove atomicity and uniqueness), and failure injection (to prove rollback). The suite itself never touches SQL or a driver, so the same
// assertions run against every store: SQLite today (this file), PostgreSQL when it exists. Nothing here weakens a rule; it only reaches the store.
import { SqliteRegistryStore } from '../lib/registry/sqlite-store.ts';
import type { SupportedAsset } from '../lib/registry/types.ts';
import type { Backend } from '../lib/server/backend.ts';
import { makeBackend } from './backend-helpers.ts';
import type { Clock } from './backend-helpers.ts';

export interface StoreHandle {
  b: Backend;
  clock: Clock;
  /** operator-configured asset (there is no API for it by design) */
  putAsset(a: SupportedAsset): void | Promise<void>;
  /** tries to UPDATE and DELETE one existing row of `table` directly in the store; reports whether a row existed and whether the store refused */
  mutate(table: string, kind: 'update' | 'delete'): Promise<{ rows: number; error: string | null }>;
  count(table: string): Promise<number>;
  /** makes every INSERT into `table` fail until the returned function is called */
  failInserts(table: string): Promise<() => Promise<void>>;
  close(): void | Promise<void>;
}

export interface StoreHarness {
  /** shown in test names, for example 'sqlite' */
  name: string;
  open(o?: { clearingContract?: string }): Promise<StoreHandle>;
}

const ident = (t: string): string => { if (!/^[a-z_]+$/.test(t)) throw new Error('bad table name'); return t; };

export const sqliteHarness: StoreHarness = {
  name: 'sqlite',
  async open(o = {}) {
    const { b, clock } = makeBackend(':memory:', undefined, o.clearingContract);
    const raw = b.db.raw;
    const store = new SqliteRegistryStore(b.db);
    return {
      b,
      clock,
      putAsset: (a) => { store.putAsset(a); },
      async mutate(table, kind) {
        const t = ident(table);
        const row = raw.prepare(`SELECT rowid AS r FROM ${t} LIMIT 1`).get() as { r: number } | undefined;
        if (!row) return { rows: 0, error: null };
        try {
          if (kind === 'delete') raw.prepare(`DELETE FROM ${t} WHERE rowid = ?`).run(row.r);
          else {
            const col = (raw.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[])[0]?.name;
            raw.prepare(`UPDATE ${t} SET ${col} = ${col} WHERE rowid = ?`).run(row.r);
          }
          return { rows: 1, error: null };
        } catch (e) { return { rows: 1, error: String((e as Error).message) }; }
      },
      async count(table) { return Number((raw.prepare(`SELECT count(*) AS n FROM ${ident(table)}`).get() as { n: number }).n); },
      async failInserts(table) {
        const t = ident(table);
        raw.exec(`CREATE TEMP TRIGGER injected_failure_${t} BEFORE INSERT ON ${t} BEGIN SELECT RAISE(ABORT, 'injected failure'); END`);
        return async () => { raw.exec(`DROP TRIGGER IF EXISTS injected_failure_${t}`); };
      },
      close() { try { raw.close(); } catch { /* already closed */ } },
    };
  },
};

/** The store the whole run uses. P4 adds a PostgreSQL harness behind the same variable; unknown values fail loudly instead of falling back. */
export function harnessFromEnv(env: Record<string, string | undefined> = process.env): StoreHarness {
  const kind = env['TOBIN_TEST_STORE'] ?? 'sqlite';
  if (kind === 'sqlite') return sqliteHarness;
  throw new Error(`TOBIN_TEST_STORE=${kind} is not a known store harness`);
}
