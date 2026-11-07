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
  {
    version: 3,
    name: 'institutional authorization: reviewers, snapshot-bound decisions, invalidations',
    sql: `
CREATE TABLE org_reviewers (
  org_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  granted_by TEXT NOT NULL REFERENCES users(id),
  granted_at TEXT NOT NULL,
  PRIMARY KEY (org_id, user_id),
  FOREIGN KEY (org_id, user_id) REFERENCES memberships(org_id, user_id) ON DELETE CASCADE
);
-- One decision per calculation snapshot (UNIQUE): a second or conflicting decision on the same snapshot cannot exist. Rows are immutable.
CREATE TABLE authorization_decisions (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  session_id TEXT NOT NULL,
  org_id TEXT NOT NULL,
  calculation_id TEXT NOT NULL UNIQUE REFERENCES calculations(id),
  decision TEXT NOT NULL CHECK (decision IN ('approved', 'rejected')),
  reason TEXT NOT NULL DEFAULT '' CHECK (length(reason) <= 500 AND ((decision = 'rejected') = (length(trim(reason)) > 0))),
  decided_by TEXT NOT NULL REFERENCES users(id),
  decided_at TEXT NOT NULL,
  FOREIGN KEY (session_id, org_id) REFERENCES sessions(session_id, org_id)
);
CREATE INDEX authorization_decisions_session ON authorization_decisions(session_id, seq);
CREATE TRIGGER authorization_decisions_no_update BEFORE UPDATE ON authorization_decisions BEGIN SELECT RAISE(ABORT, 'authorization decisions are immutable'); END;
CREATE TRIGGER authorization_decisions_no_delete BEFORE DELETE ON authorization_decisions BEGIN SELECT RAISE(ABORT, 'authorization decisions are immutable'); END;
-- A decision stops authorizing when an invalidation row exists. Recorded once, never edited: the decision itself stays as history.
CREATE TABLE authorization_invalidations (
  decision_id TEXT PRIMARY KEY REFERENCES authorization_decisions(id),
  cause TEXT NOT NULL CHECK (length(cause) BETWEEN 1 AND 300),
  at TEXT NOT NULL,
  by_actor TEXT NOT NULL
);
CREATE TRIGGER authorization_invalidations_no_update BEFORE UPDATE ON authorization_invalidations BEGIN SELECT RAISE(ABORT, 'authorization invalidations are immutable'); END;
CREATE TRIGGER authorization_invalidations_no_delete BEFORE DELETE ON authorization_invalidations BEGIN SELECT RAISE(ABORT, 'authorization invalidations are immutable'); END;
`,
  },
  {
    version: 4,
    name: 'settlement preparation: supported assets, batches, instructions, batch reviews, invalidations',
    sql: `
-- Operator-configured list of assets the application will prepare settlement for. LOCAL CONFIGURATION: it is not an on-chain query and says nothing about
-- availability, liquidity or transferability. Identity is network + (native | code + issuer): a code alone is never an identity.
CREATE TABLE supported_assets (
  id TEXT PRIMARY KEY,
  network TEXT NOT NULL CHECK (network IN ('testnet', 'public')),
  kind TEXT NOT NULL CHECK (kind IN ('native', 'issued')),
  code TEXT NOT NULL CHECK (length(code) BETWEEN 1 AND 12 AND code NOT GLOB '*[^A-Z0-9]*'),
  issuer TEXT,
  status TEXT NOT NULL CHECK (status IN ('supported', 'disabled')),
  source TEXT NOT NULL DEFAULT 'operator-configured' CHECK (source = 'operator-configured'),
  added_at TEXT NOT NULL,
  CHECK ((kind = 'native') = (issuer IS NULL)),
  CHECK (kind = 'issued' OR code = 'XLM'),
  CHECK (issuer IS NULL OR (length(issuer) = 56 AND issuer GLOB 'G*' AND issuer NOT GLOB '*[^A-Z2-7]*')),
  CHECK (id = CASE WHEN kind = 'native' THEN network || ':native' ELSE network || ':' || code || ':' || issuer END)
);
-- A batch is bound to exactly one calculation snapshot (UNIQUE). Everything is immutable; status is derived from reviews and invalidations.
CREATE TABLE settlement_batches (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  session_id TEXT NOT NULL,
  org_id TEXT NOT NULL,
  calculation_id TEXT NOT NULL UNIQUE REFERENCES calculations(id),
  asset_id TEXT NOT NULL,
  asset_network TEXT NOT NULL,
  asset_kind TEXT NOT NULL,
  asset_code TEXT NOT NULL,
  asset_issuer TEXT,
  instruction_count INTEGER NOT NULL CHECK (instruction_count >= 0),
  total_amount TEXT NOT NULL CHECK (length(total_amount) BETWEEN 1 AND 39 AND total_amount NOT GLOB '*[^0-9]*'),
  instructions_hash TEXT NOT NULL CHECK (length(instructions_hash) = 64),
  algorithm TEXT NOT NULL,
  validation_json TEXT NOT NULL,
  prepared_by TEXT NOT NULL REFERENCES users(id),
  prepared_at TEXT NOT NULL,
  UNIQUE (id, session_id, calculation_id),
  FOREIGN KEY (session_id, org_id) REFERENCES sessions(session_id, org_id)
);
CREATE INDEX settlement_batches_session ON settlement_batches(session_id, seq);
CREATE TABLE settlement_instructions (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  calculation_id TEXT NOT NULL,
  seq INTEGER NOT NULL CHECK (seq >= 1),
  payer TEXT NOT NULL,
  payee TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  amount TEXT NOT NULL CHECK (length(amount) BETWEEN 1 AND 39 AND amount NOT GLOB '*[^0-9]*' AND amount NOT GLOB '0*'),
  CHECK (payer <> payee),
  UNIQUE (batch_id, seq),
  UNIQUE (batch_id, payer, payee),
  FOREIGN KEY (batch_id, session_id, calculation_id) REFERENCES settlement_batches(id, session_id, calculation_id)
);
CREATE TABLE settlement_batch_reviews (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  batch_id TEXT NOT NULL UNIQUE REFERENCES settlement_batches(id),
  decision TEXT NOT NULL CHECK (decision IN ('approved', 'rejected')),
  reason TEXT NOT NULL DEFAULT '' CHECK (length(reason) <= 500 AND ((decision = 'rejected') = (length(trim(reason)) > 0))),
  decided_by TEXT NOT NULL REFERENCES users(id),
  decided_at TEXT NOT NULL
);
CREATE TABLE settlement_batch_invalidations (
  batch_id TEXT PRIMARY KEY REFERENCES settlement_batches(id),
  cause TEXT NOT NULL CHECK (length(cause) BETWEEN 1 AND 300),
  at TEXT NOT NULL,
  by_actor TEXT NOT NULL
);
CREATE TRIGGER settlement_batches_no_update BEFORE UPDATE ON settlement_batches BEGIN SELECT RAISE(ABORT, 'settlement batches are immutable'); END;
CREATE TRIGGER settlement_batches_no_delete BEFORE DELETE ON settlement_batches BEGIN SELECT RAISE(ABORT, 'settlement batches are immutable'); END;
CREATE TRIGGER settlement_instructions_no_update BEFORE UPDATE ON settlement_instructions BEGIN SELECT RAISE(ABORT, 'settlement instructions are immutable'); END;
CREATE TRIGGER settlement_instructions_no_delete BEFORE DELETE ON settlement_instructions BEGIN SELECT RAISE(ABORT, 'settlement instructions are immutable'); END;
CREATE TRIGGER settlement_batch_reviews_no_update BEFORE UPDATE ON settlement_batch_reviews BEGIN SELECT RAISE(ABORT, 'settlement batch reviews are immutable'); END;
CREATE TRIGGER settlement_batch_reviews_no_delete BEFORE DELETE ON settlement_batch_reviews BEGIN SELECT RAISE(ABORT, 'settlement batch reviews are immutable'); END;
CREATE TRIGGER settlement_batch_invalidations_no_update BEFORE UPDATE ON settlement_batch_invalidations BEGIN SELECT RAISE(ABORT, 'settlement batch invalidations are immutable'); END;
CREATE TRIGGER settlement_batch_invalidations_no_delete BEFORE DELETE ON settlement_batch_invalidations BEGIN SELECT RAISE(ABORT, 'settlement batch invalidations are immutable'); END;
`,
  },
  {
    version: 5,
    name: 'asset identity, re-preparation attempts, instruction contract, wallet ownership challenges, settlement execution events',
    sql: `
-- 1. Asset identity on obligations and calculation snapshots. Historical rows are NEVER guessed: they stay 'legacy-unresolved' (asset_ref NULL) and cannot enter
--    settlement preparation until an administrator reconciles them (editing the obligation, which records a revision). Snapshots keep their original content.
ALTER TABLE obligations ADD COLUMN asset_ref TEXT;
ALTER TABLE obligations ADD COLUMN asset_identity TEXT NOT NULL DEFAULT 'legacy-unresolved' CHECK (asset_identity IN ('canonical', 'legacy-unresolved') AND (asset_identity = 'legacy-unresolved' OR asset_ref IS NOT NULL));
ALTER TABLE calculations ADD COLUMN asset_ref TEXT;

-- 2. The supported asset list gains the Soroban token kind (what the deployed clearing contract settles in). Rebuilt: no other table references it.
CREATE TABLE supported_assets_v2 (
  id TEXT PRIMARY KEY,
  network TEXT NOT NULL CHECK (network IN ('testnet', 'public')),
  kind TEXT NOT NULL CHECK (kind IN ('native', 'issued', 'contract')),
  code TEXT NOT NULL CHECK (length(code) BETWEEN 1 AND 12 AND code NOT GLOB '*[^A-Z0-9]*'),
  issuer TEXT,
  contract_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('supported', 'disabled')),
  source TEXT NOT NULL DEFAULT 'operator-configured' CHECK (source = 'operator-configured'),
  added_at TEXT NOT NULL,
  CHECK ((kind = 'issued') = (issuer IS NOT NULL)),
  CHECK ((kind = 'contract') = (contract_id IS NOT NULL)),
  CHECK (kind <> 'native' OR code = 'XLM'),
  CHECK (issuer IS NULL OR (length(issuer) = 56 AND issuer GLOB 'G*' AND issuer NOT GLOB '*[^A-Z2-7]*')),
  CHECK (contract_id IS NULL OR (length(contract_id) = 56 AND contract_id GLOB 'C*' AND contract_id NOT GLOB '*[^A-Z2-7]*')),
  CHECK (id = CASE kind WHEN 'native' THEN network || ':native' WHEN 'issued' THEN network || ':' || code || ':' || issuer ELSE network || ':contract:' || contract_id END)
);
INSERT INTO supported_assets_v2 (id, network, kind, code, issuer, status, source, added_at) SELECT id, network, kind, code, issuer, status, source, added_at FROM supported_assets;
DROP TABLE supported_assets;
ALTER TABLE supported_assets_v2 RENAME TO supported_assets;

-- 3. Settlement batches are rebuilt so a rejected batch can be prepared again: UNIQUE(calculation_id) becomes UNIQUE(calculation_id, attempt). Instructions gain the
--    stabilized instruction contract. Existing rows are copied unchanged (attempt 1; new columns derived from the same row or left NULL for legacy rows).
CREATE TABLE settlement_batches_v2 (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  session_id TEXT NOT NULL,
  org_id TEXT NOT NULL,
  calculation_id TEXT NOT NULL REFERENCES calculations(id),
  attempt INTEGER NOT NULL DEFAULT 1 CHECK (attempt >= 1),
  asset_id TEXT NOT NULL,
  asset_network TEXT NOT NULL,
  asset_kind TEXT NOT NULL,
  asset_code TEXT NOT NULL,
  asset_issuer TEXT,
  instruction_count INTEGER NOT NULL CHECK (instruction_count >= 0),
  total_amount TEXT NOT NULL CHECK (length(total_amount) BETWEEN 1 AND 39 AND total_amount NOT GLOB '*[^0-9]*'),
  instructions_hash TEXT NOT NULL CHECK (length(instructions_hash) = 64),
  algorithm TEXT NOT NULL,
  validation_json TEXT NOT NULL,
  prepared_by TEXT NOT NULL REFERENCES users(id),
  prepared_at TEXT NOT NULL,
  UNIQUE (id, session_id, calculation_id),
  UNIQUE (calculation_id, attempt),
  FOREIGN KEY (session_id, org_id) REFERENCES sessions(session_id, org_id)
);
INSERT INTO settlement_batches_v2 (seq, id, session_id, org_id, calculation_id, attempt, asset_id, asset_network, asset_kind, asset_code, asset_issuer, instruction_count, total_amount, instructions_hash, algorithm, validation_json, prepared_by, prepared_at)
  SELECT seq, id, session_id, org_id, calculation_id, 1, asset_id, asset_network, asset_kind, asset_code, asset_issuer, instruction_count, total_amount, instructions_hash, algorithm, validation_json, prepared_by, prepared_at FROM settlement_batches;
CREATE TABLE settlement_instructions_v2 (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  org_id TEXT,
  calculation_id TEXT NOT NULL,
  approval_decision_id TEXT,
  network TEXT,
  seq INTEGER NOT NULL CHECK (seq >= 1),
  payer TEXT NOT NULL,
  payee TEXT NOT NULL,
  source_account TEXT,
  destination_account TEXT,
  asset_id TEXT NOT NULL,
  amount TEXT NOT NULL CHECK (length(amount) BETWEEN 1 AND 39 AND amount NOT GLOB '*[^0-9]*' AND amount NOT GLOB '0*'),
  fingerprint TEXT,
  validation_status TEXT NOT NULL DEFAULT 'valid' CHECK (validation_status = 'valid'),
  CHECK (payer <> payee),
  CHECK (source_account IS NULL AND destination_account IS NULL),
  UNIQUE (batch_id, seq),
  UNIQUE (batch_id, payer, payee),
  FOREIGN KEY (batch_id, session_id, calculation_id) REFERENCES settlement_batches_v2(id, session_id, calculation_id)
);
INSERT INTO settlement_instructions_v2 (id, batch_id, session_id, org_id, calculation_id, approval_decision_id, network, seq, payer, payee, asset_id, amount)
  SELECT i.id, i.batch_id, i.session_id, b.org_id, i.calculation_id, (SELECT d.id FROM authorization_decisions d WHERE d.calculation_id = i.calculation_id AND d.decision = 'approved'), substr(i.asset_id, 1, instr(i.asset_id, ':') - 1), i.seq, i.payer, i.payee, i.asset_id, i.amount
  FROM settlement_instructions i JOIN settlement_batches b ON b.id = i.batch_id;
CREATE TABLE settlement_batch_reviews_v2 (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  batch_id TEXT NOT NULL UNIQUE REFERENCES settlement_batches_v2(id),
  decision TEXT NOT NULL CHECK (decision IN ('approved', 'rejected')),
  reason TEXT NOT NULL DEFAULT '' CHECK (length(reason) <= 500 AND ((decision = 'rejected') = (length(trim(reason)) > 0))),
  decided_by TEXT NOT NULL REFERENCES users(id),
  decided_at TEXT NOT NULL
);
INSERT INTO settlement_batch_reviews_v2 (seq, id, batch_id, decision, reason, decided_by, decided_at) SELECT seq, id, batch_id, decision, reason, decided_by, decided_at FROM settlement_batch_reviews;
CREATE TABLE settlement_batch_invalidations_v2 (
  batch_id TEXT PRIMARY KEY REFERENCES settlement_batches_v2(id),
  cause TEXT NOT NULL CHECK (length(cause) BETWEEN 1 AND 300),
  at TEXT NOT NULL,
  by_actor TEXT NOT NULL
);
INSERT INTO settlement_batch_invalidations_v2 (batch_id, cause, at, by_actor) SELECT batch_id, cause, at, by_actor FROM settlement_batch_invalidations;
DROP TABLE settlement_instructions;
DROP TABLE settlement_batch_reviews;
DROP TABLE settlement_batch_invalidations;
DROP TABLE settlement_batches;
ALTER TABLE settlement_batches_v2 RENAME TO settlement_batches;
ALTER TABLE settlement_instructions_v2 RENAME TO settlement_instructions;
ALTER TABLE settlement_batch_reviews_v2 RENAME TO settlement_batch_reviews;
ALTER TABLE settlement_batch_invalidations_v2 RENAME TO settlement_batch_invalidations;
CREATE INDEX settlement_batches_session ON settlement_batches(session_id, seq);
CREATE TRIGGER settlement_batches_no_update BEFORE UPDATE ON settlement_batches BEGIN SELECT RAISE(ABORT, 'settlement batches are immutable'); END;
CREATE TRIGGER settlement_batches_no_delete BEFORE DELETE ON settlement_batches BEGIN SELECT RAISE(ABORT, 'settlement batches are immutable'); END;
CREATE TRIGGER settlement_instructions_no_update BEFORE UPDATE ON settlement_instructions BEGIN SELECT RAISE(ABORT, 'settlement instructions are immutable'); END;
CREATE TRIGGER settlement_instructions_no_delete BEFORE DELETE ON settlement_instructions BEGIN SELECT RAISE(ABORT, 'settlement instructions are immutable'); END;
CREATE TRIGGER settlement_batch_reviews_no_update BEFORE UPDATE ON settlement_batch_reviews BEGIN SELECT RAISE(ABORT, 'settlement batch reviews are immutable'); END;
CREATE TRIGGER settlement_batch_reviews_no_delete BEFORE DELETE ON settlement_batch_reviews BEGIN SELECT RAISE(ABORT, 'settlement batch reviews are immutable'); END;
CREATE TRIGGER settlement_batch_invalidations_no_update BEFORE UPDATE ON settlement_batch_invalidations BEGIN SELECT RAISE(ABORT, 'settlement batch invalidations are immutable'); END;
CREATE TRIGGER settlement_batch_invalidations_no_delete BEFORE DELETE ON settlement_batch_invalidations BEGIN SELECT RAISE(ABORT, 'settlement batch invalidations are immutable'); END;

-- 4. Wallet ownership challenges (a connected wallet proves nothing; a verified signature over a one-time challenge proves control of the key).
CREATE TABLE wallet_challenges (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  network TEXT NOT NULL CHECK (network IN ('testnet', 'public')),
  public_key TEXT NOT NULL CHECK (length(public_key) = 56 AND public_key GLOB 'G*'),
  nonce TEXT NOT NULL CHECK (length(nonce) = 48),
  message TEXT NOT NULL,
  issued_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  FOREIGN KEY (org_id, user_id) REFERENCES memberships(org_id, user_id) ON DELETE CASCADE
);
CREATE TABLE wallet_verifications (
  org_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  network TEXT NOT NULL CHECK (network IN ('testnet', 'public')),
  public_key TEXT NOT NULL,
  scheme TEXT NOT NULL CHECK (scheme IN ('raw', 'sep-53')),
  challenge_id TEXT NOT NULL UNIQUE REFERENCES wallet_challenges(id),
  verified_at TEXT NOT NULL,
  PRIMARY KEY (org_id, network, public_key),
  FOREIGN KEY (org_id, user_id) REFERENCES memberships(org_id, user_id) ON DELETE CASCADE
);

-- 5. Settlement execution: one execution per approved batch; its state is the last event. Events are append-only.
CREATE TABLE settlement_executions (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL UNIQUE REFERENCES settlement_batches(id),
  session_id TEXT NOT NULL,
  org_id TEXT NOT NULL,
  network TEXT NOT NULL CHECK (network IN ('testnet', 'public')),
  accounts_json TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE TABLE settlement_execution_events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  execution_id TEXT NOT NULL REFERENCES settlement_executions(id),
  from_state TEXT,
  to_state TEXT NOT NULL,
  actor TEXT NOT NULL,
  at TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  evidence_json TEXT
);
CREATE INDEX settlement_execution_events_exec ON settlement_execution_events(execution_id, seq);
CREATE TRIGGER settlement_executions_no_update BEFORE UPDATE ON settlement_executions BEGIN SELECT RAISE(ABORT, 'settlement executions are immutable'); END;
CREATE TRIGGER settlement_executions_no_delete BEFORE DELETE ON settlement_executions BEGIN SELECT RAISE(ABORT, 'settlement executions are immutable'); END;
CREATE TRIGGER settlement_execution_events_no_update BEFORE UPDATE ON settlement_execution_events BEGIN SELECT RAISE(ABORT, 'settlement execution events are immutable'); END;
CREATE TRIGGER settlement_execution_events_no_delete BEFORE DELETE ON settlement_execution_events BEGIN SELECT RAISE(ABORT, 'settlement execution events are immutable'); END;
`,
  },
  {
    version: 6,
    name: 'execution attempts: immutable attempts, append-only attempt events, one transaction hash per attempt step',
    sql: `
-- A settlement batch is the approved economics; an ATTEMPT is one technical try to execute it. Attempts are never overwritten.
CREATE TABLE settlement_attempts (
  id TEXT PRIMARY KEY,
  execution_id TEXT NOT NULL REFERENCES settlement_executions(id),
  attempt_no INTEGER NOT NULL CHECK (attempt_no >= 1),
  network TEXT NOT NULL CHECK (network IN ('testnet', 'public')),
  plan_fingerprint TEXT NOT NULL CHECK (length(plan_fingerprint) = 64),
  plan_json TEXT NOT NULL,
  initiator TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  UNIQUE (execution_id, attempt_no)
);
CREATE TABLE settlement_attempt_events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  attempt_id TEXT NOT NULL REFERENCES settlement_attempts(id),
  kind TEXT NOT NULL CHECK (kind IN ('transition', 'note')),
  from_state TEXT,
  to_state TEXT NOT NULL,
  actor TEXT NOT NULL,
  at TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  evidence_json TEXT,
  CHECK (kind = 'transition' OR from_state = to_state)
);
CREATE INDEX settlement_attempt_events_attempt ON settlement_attempt_events(attempt_id, seq);
-- A transaction hash belongs to exactly ONE step of exactly ONE attempt (UNIQUE hash), and a step is submitted at most once per attempt (UNIQUE attempt + step):
-- a duplicate submission is refused by the schema, not only by the application.
CREATE TABLE settlement_attempt_transactions (
  tx_hash TEXT PRIMARY KEY CHECK (length(tx_hash) = 64 AND tx_hash NOT GLOB '*[^0-9a-f]*'),
  attempt_id TEXT NOT NULL REFERENCES settlement_attempts(id),
  step_index INTEGER NOT NULL CHECK (step_index >= 1),
  network TEXT NOT NULL CHECK (network IN ('testnet', 'public')),
  recorded_by TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  UNIQUE (attempt_id, step_index)
);
CREATE TRIGGER settlement_attempts_no_update BEFORE UPDATE ON settlement_attempts BEGIN SELECT RAISE(ABORT, 'settlement attempts are immutable'); END;
CREATE TRIGGER settlement_attempts_no_delete BEFORE DELETE ON settlement_attempts BEGIN SELECT RAISE(ABORT, 'settlement attempts are immutable'); END;
CREATE TRIGGER settlement_attempt_events_no_update BEFORE UPDATE ON settlement_attempt_events BEGIN SELECT RAISE(ABORT, 'settlement attempt events are immutable'); END;
CREATE TRIGGER settlement_attempt_events_no_delete BEFORE DELETE ON settlement_attempt_events BEGIN SELECT RAISE(ABORT, 'settlement attempt events are immutable'); END;
CREATE TRIGGER settlement_attempt_transactions_no_update BEFORE UPDATE ON settlement_attempt_transactions BEGIN SELECT RAISE(ABORT, 'settlement attempt transactions are immutable'); END;
CREATE TRIGGER settlement_attempt_transactions_no_delete BEFORE DELETE ON settlement_attempt_transactions BEGIN SELECT RAISE(ABORT, 'settlement attempt transactions are immutable'); END;
`,
  },
  {
    version: 7,
    name: 'signer-set snapshots: versioned, immutable records of an account signer set read from the chain',
    sql: `
-- A snapshot is what the CHAIN said (Horizon and the RPC agreed) at the time of recording; it is never entered by hand and never edited. A later snapshot with a
-- different fingerprint supersedes it (derived: the latest per account is current). It is information for verification, not an authorization or a role.
CREATE TABLE signer_set_snapshots (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  network TEXT NOT NULL CHECK (network IN ('testnet', 'public')),
  account TEXT NOT NULL CHECK (length(account) = 56 AND account GLOB 'G*'),
  fingerprint TEXT NOT NULL CHECK (length(fingerprint) = 64 AND fingerprint NOT GLOB '*[^0-9a-f]*'),
  thresholds_json TEXT NOT NULL,
  signers_json TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source = 'horizon+rpc-agreed'),
  recorded_by TEXT NOT NULL REFERENCES users(id),
  recorded_at TEXT NOT NULL,
  UNIQUE (org_id, network, account, fingerprint)
);
CREATE TRIGGER signer_set_snapshots_no_update BEFORE UPDATE ON signer_set_snapshots BEGIN SELECT RAISE(ABORT, 'signer-set snapshots are immutable'); END;
CREATE TRIGGER signer_set_snapshots_no_delete BEFORE DELETE ON signer_set_snapshots BEGIN SELECT RAISE(ABORT, 'signer-set snapshots are immutable'); END;
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
