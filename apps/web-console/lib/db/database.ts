// Durable storage for the institutional application: SQLite through Node's built-in `node:sqlite` (no new dependency). See
// docs/product/architecture/mvp-1.2/BACKEND_PERSISTENCE_ARCHITECTURE.md for why, and for the limits (single instance, experimental Node module).
// Everything that touches the database goes through this module, the registry store and the auth store. UI code never opens a database.
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export interface Migration { version: number; name: string; sql: string }

export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: 'initial schema: users, auth sessions, organizations, memberships, wallet claims, invitations, sessions, participants, activity',
    sql: `
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE CHECK (email = lower(email) AND length(email) BETWEEN 3 AND 254),
  display_name TEXT NOT NULL CHECK (length(display_name) BETWEEN 1 AND 80),
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  disabled INTEGER NOT NULL DEFAULT 0 CHECK (disabled IN (0, 1))
);
CREATE TABLE auth_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE INDEX auth_sessions_user ON auth_sessions(user_id);
CREATE TABLE rate_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX rate_events_key_at ON rate_events(key, at);
CREATE TABLE organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 2 AND 80),
  description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 500),
  visibility TEXT NOT NULL CHECK (visibility IN ('private', 'public')),
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id)
);
CREATE TABLE memberships (
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'member')),
  since TEXT NOT NULL,
  PRIMARY KEY (org_id, user_id)
);
CREATE INDEX memberships_user ON memberships(user_id);
CREATE TABLE org_wallets (
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  address TEXT NOT NULL CHECK (address GLOB 'G*' AND length(address) = 56),
  proof TEXT NOT NULL CHECK (proof IN ('none', 'signature-verified')),
  PRIMARY KEY (org_id, address)
);
CREATE TABLE invitations (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  invitee TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'member')),
  token_hash TEXT NOT NULL UNIQUE CHECK (length(token_hash) = 64),
  status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'revoked')),
  expires_at TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id)
);
CREATE INDEX invitations_org ON invitations(org_id);
CREATE TABLE sessions (
  session_id TEXT PRIMARY KEY CHECK (length(session_id) = 64 AND session_id NOT GLOB '*[^0-9a-f]*'),
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  label TEXT NOT NULL CHECK (length(label) BETWEEN 1 AND 80),
  provenance TEXT NOT NULL CHECK (provenance IN ('fixture', 'local-draft', 'chain-read', 'chain-confirmed')),
  created_at TEXT NOT NULL,
  chain_json TEXT,
  confirmed_tx_hash TEXT,
  UNIQUE (session_id, org_id),
  -- Provenance integrity enforced by the database itself: only chain-backed records carry a chain observation, and only chain-confirmed carries a hash.
  CHECK ((provenance IN ('chain-read', 'chain-confirmed')) = (chain_json IS NOT NULL)),
  CHECK ((provenance = 'chain-confirmed') = (confirmed_tx_hash IS NOT NULL)),
  CHECK (confirmed_tx_hash IS NULL OR (length(confirmed_tx_hash) = 64 AND confirmed_tx_hash NOT GLOB '*[^0-9a-f]*'))
);
CREATE INDEX sessions_org ON sessions(org_id, created_at);
CREATE TABLE session_participants (
  session_id TEXT NOT NULL,
  org_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  wallet_address TEXT,
  added_by TEXT NOT NULL,
  added_at TEXT NOT NULL,
  PRIMARY KEY (session_id, user_id),
  FOREIGN KEY (session_id, org_id) REFERENCES sessions(session_id, org_id) ON DELETE CASCADE,
  FOREIGN KEY (org_id, user_id) REFERENCES memberships(org_id, user_id) ON DELETE CASCADE
);
CREATE TABLE activity (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  at TEXT NOT NULL,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor TEXT NOT NULL,
  kind TEXT NOT NULL,
  subject TEXT NOT NULL,
  detail TEXT NOT NULL
);
CREATE INDEX activity_org ON activity(org_id, seq);
-- The activity history is append-only at the database level too: no ordinary statement can change or remove a record.
CREATE TRIGGER activity_no_update BEFORE UPDATE ON activity BEGIN SELECT RAISE(ABORT, 'activity records are immutable'); END;
CREATE TRIGGER activity_no_delete BEFORE DELETE ON activity BEGIN SELECT RAISE(ABORT, 'activity records are immutable'); END;
`,
  },
  {
    version: 2,
    name: 'clearing operations: workflow state, participant status, obligations, calculation snapshots',
    sql: `
ALTER TABLE sessions ADD COLUMN workflow_state TEXT NOT NULL DEFAULT 'configuring' CHECK (workflow_state IN ('configuring', 'ready', 'closed'));
-- Participants are rebuilt without the membership foreign key: removing an organization member must neither erase nor be blocked by the session history;
-- the application marks the participation removed instead. Eligibility (member of the session organization) is checked when a participant is added.
CREATE TABLE session_participants_v2 (
  session_id TEXT NOT NULL,
  org_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  wallet_address TEXT,
  added_by TEXT NOT NULL,
  added_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'removed')),
  removed_at TEXT,
  PRIMARY KEY (session_id, user_id),
  CHECK ((status = 'removed') = (removed_at IS NOT NULL)),
  FOREIGN KEY (session_id, org_id) REFERENCES sessions(session_id, org_id) ON DELETE CASCADE
);
INSERT INTO session_participants_v2 (session_id, org_id, user_id, wallet_address, added_by, added_at) SELECT session_id, org_id, user_id, wallet_address, added_by, added_at FROM session_participants;
DROP TABLE session_participants;
ALTER TABLE session_participants_v2 RENAME TO session_participants;
CREATE TABLE obligations (
  id TEXT PRIMARY KEY CHECK (length(id) = 64 AND id NOT GLOB '*[^0-9a-f]*'),
  session_id TEXT NOT NULL,
  org_id TEXT NOT NULL,
  debtor TEXT NOT NULL,
  creditor TEXT NOT NULL,
  amount TEXT NOT NULL CHECK (length(amount) BETWEEN 1 AND 39 AND amount NOT GLOB '*[^0-9]*' AND amount NOT GLOB '0*'),
  asset TEXT NOT NULL CHECK (length(asset) BETWEEN 1 AND 12 AND asset NOT GLOB '*[^A-Z0-9]*'),
  reference TEXT NOT NULL DEFAULT '' CHECK (length(reference) <= 200),
  status TEXT NOT NULL CHECK (status IN ('active', 'voided')),
  revision INTEGER NOT NULL CHECK (revision >= 1),
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  CHECK (debtor <> creditor),
  FOREIGN KEY (session_id, org_id) REFERENCES sessions(session_id, org_id) ON DELETE CASCADE,
  FOREIGN KEY (session_id, debtor) REFERENCES session_participants(session_id, user_id),
  FOREIGN KEY (session_id, creditor) REFERENCES session_participants(session_id, user_id)
);
CREATE INDEX obligations_session ON obligations(session_id, created_at);
CREATE TABLE calculations (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  session_id TEXT NOT NULL,
  org_id TEXT NOT NULL,
  asset TEXT NOT NULL,
  input_hash TEXT NOT NULL CHECK (length(input_hash) = 64),
  input_json TEXT NOT NULL,
  positions_json TEXT NOT NULL,
  gross TEXT NOT NULL,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  FOREIGN KEY (session_id, org_id) REFERENCES sessions(session_id, org_id) ON DELETE CASCADE
);
CREATE INDEX calculations_session ON calculations(session_id, seq);
-- A calculation is a snapshot: never edited or removed (a newer one supersedes it).
CREATE TRIGGER calculations_no_update BEFORE UPDATE ON calculations BEGIN SELECT RAISE(ABORT, 'calculation snapshots are immutable'); END;
CREATE TRIGGER calculations_no_delete BEFORE DELETE ON calculations BEGIN SELECT RAISE(ABORT, 'calculation snapshots are immutable'); END;
`,
  },
];

export class Database {
  readonly raw: DatabaseSync;
  #depth = 0;
  constructor(raw: DatabaseSync) { this.raw = raw; }

  /** Runs fn atomically (BEGIN IMMEDIATE ... COMMIT). Nested calls join the outer transaction. Any throw rolls everything back. */
  tx<T>(fn: () => T): T {
    if (this.#depth > 0) return fn();
    this.raw.exec('BEGIN IMMEDIATE');
    this.#depth = 1;
    try {
      const out = fn();
      this.raw.exec('COMMIT');
      return out;
    } catch (e) {
      try { this.raw.exec('ROLLBACK'); } catch { /* already rolled back */ }
      throw e;
    } finally {
      this.#depth = 0;
    }
  }
  close(): void { this.raw.close(); }
}

export interface MigrationStatus { current: number; latest: number; pending: number[]; applied: { version: number; name: string; appliedAt: string }[] }

export function migrationStatus(db: Database, migrations: readonly Migration[] = MIGRATIONS): MigrationStatus {
  db.raw.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)');
  const applied = db.raw.prepare('SELECT version, name, applied_at AS appliedAt FROM schema_migrations ORDER BY version').all() as unknown as MigrationStatus['applied'];
  const have = new Set(applied.map((a) => a.version));
  const latest = migrations[migrations.length - 1]?.version ?? 0;
  return { current: applied.length ? Math.max(...applied.map((a) => a.version)) : 0, latest, pending: migrations.filter((m) => !have.has(m.version)).map((m) => m.version), applied };
}

/** Applies pending migrations in order, each in its own transaction. Safe to run repeatedly. A database newer than this code is refused. */
export function migrate(db: Database, now: () => Date = () => new Date(), migrations: readonly Migration[] = MIGRATIONS): MigrationStatus {
  const st = migrationStatus(db, migrations);
  if (st.current > st.latest) throw new Error(`database schema version ${st.current} is newer than this application (${st.latest}); refusing to run`);
  for (const m of migrations) {
    if (!st.pending.includes(m.version)) continue;
    db.tx(() => {
      db.raw.exec(m.sql);
      db.raw.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)').run(m.version, m.name, now().toISOString());
    });
  }
  return migrationStatus(db, migrations);
}

/** Opens (creating the file and its directory if needed) with foreign keys enforced and WAL journaling. Does not migrate. */
export function openDatabase(path: string): Database {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const raw = new DatabaseSync(path);
  raw.exec('PRAGMA foreign_keys = ON');
  raw.exec('PRAGMA busy_timeout = 5000');
  if (path !== ':memory:') raw.exec('PRAGMA journal_mode = WAL');
  return new Database(raw);
}
