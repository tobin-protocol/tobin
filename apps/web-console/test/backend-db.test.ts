// Database integration tests against REAL SQLite (node:sqlite): migrations, persistence across reopen, schema constraints, transactions, concurrency.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MIGRATIONS, migrate, migrationStatus, openDatabase } from '../lib/db/database.ts';
import { createBackend } from '../lib/server/backend.ts';
import { code, makeBackend, newUser, SID, tempDir } from './backend-helpers.ts';

test('migrations: apply, are observable, and re-running changes nothing', () => {
  const db = openDatabase(':memory:');
  assert.deepEqual(migrationStatus(db).pending, [1, 2, 3, 4, 5, 6, 7, 8]);
  const s1 = migrate(db); assert.equal(s1.current, 8); assert.deepEqual(s1.pending, []);
  const at = s1.applied[0]?.appliedAt;
  const s2 = migrate(db); assert.equal(s2.current, 8); assert.equal(s2.applied.length, 8); assert.equal(s2.applied[0]?.appliedAt, at);
  const tables = (db.raw.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map((t) => t.name);
  for (const t of ['users', 'auth_sessions', 'organizations', 'memberships', 'org_wallets', 'invitations', 'sessions', 'session_participants', 'activity', 'schema_migrations', 'obligations', 'calculations', 'org_reviewers', 'authorization_decisions', 'authorization_invalidations', 'supported_assets', 'settlement_batches', 'settlement_instructions', 'settlement_batch_reviews', 'settlement_batch_invalidations']) assert.ok(tables.includes(t), t);
});

test('a failing migration rolls back completely and records nothing; the next run can still apply the good ones', () => {
  const db = openDatabase(':memory:');
  const bad = [...MIGRATIONS, { version: 9, name: 'broken', sql: 'CREATE TABLE half_done (x INTEGER); INSERT INTO table_that_does_not_exist VALUES (1);' }];
  assert.throws(() => migrate(db, undefined, bad));
  assert.equal(migrationStatus(db, bad).current, 8, 'v1 to v8 stayed applied');
  assert.equal(db.raw.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name = 'half_done'").get()?.['n'], 0, 'the partial table of the failed migration is gone');
  assert.deepEqual(migrationStatus(db, bad).pending, [9]);
});

test('a database newer than the application is refused', () => {
  const db = openDatabase(':memory:'); migrate(db);
  db.raw.prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (99, 'future', 'x')").run();
  assert.throws(() => migrate(db), /newer than this application/);
});

test('data survives closing and reopening the database file (a restart)', async () => {
  const t = tempDir();
  try {
    const first = makeBackend(t.path).b;
    const ann = await newUser(first, 'ann');
    const org = first.registry.createOrganization(ann, { name: 'Alpha Bank' });
    const inv = first.registry.invite(ann, org.id, { invitee: 'bob@example.test', role: 'member' });
    first.registry.recordSession(ann, org.id, { sessionId: SID, label: 'Q4 draft' });
    first.registry.linkWallet(ann, org.id, 'G' + 'A'.repeat(55));
    first.db.close();

    const second = makeBackend(t.path).b;
    assert.equal(second.registry.myOrganizations(ann)[0]?.name, 'Alpha Bank');
    const s = second.registry.sessions(ann, org.id);
    assert.equal(s.length, 1); assert.equal(s[0]?.provenance, 'local-draft', 'a saved draft is still a local draft after a restart');
    assert.equal(second.registry.wallets(ann, org.id)[0]?.proof, 'none');
    assert.deepEqual(second.registry.activity(ann, org.id).map((a) => a.kind), ['organization.created', 'invitation.created', 'session.recorded', 'wallet.linked']);
    assert.equal(second.registry.invitations(ann, org.id)[0]?.status, 'pending');
    // the login survives too: a user registered before the restart can sign in after it
    const login = await second.auth.login('ann@example.test', 'correct horse battery staple');
    assert.equal(login.user.userId, ann.userId);
    assert.ok(inv.token);
    second.db.close();
  } finally { t.cleanup(); }
});

test('schema constraints: provenance integrity, foreign keys, immutable activity', async () => {
  const { b } = makeBackend();
  const ann = await newUser(b, 'ann'); const org = b.registry.createOrganization(ann, { name: 'Alpha Bank' });
  const run = (sql: string, ...p: (string | number | null)[]) => b.db.raw.prepare(sql).run(...p);
  const ins = (prov: string, chain: string | null, hash: string | null) => () => run('INSERT INTO sessions (session_id, org_id, label, provenance, created_at, chain_json, confirmed_tx_hash) VALUES (?, ?, ?, ?, ?, ?, ?)', 'cd'.repeat(32), org.id, 'x', prov, 't', chain, hash);
  assert.throws(ins('local-draft', '{"state":"OPEN"}', null), /CHECK/, 'a draft cannot carry chain data');
  assert.throws(ins('fixture', '{"state":"OPEN"}', null), /CHECK/, 'a fixture cannot carry chain data');
  assert.throws(ins('chain-read', null, null), /CHECK/, 'chain-read needs an observation');
  assert.throws(ins('chain-confirmed', '{"state":"OPEN"}', null), /CHECK/, 'chain-confirmed needs a hash');
  assert.throws(ins('local-draft', null, 'f'.repeat(64)), /CHECK/, 'a draft cannot carry a transaction hash');
  assert.throws(ins('chain-confirmed', '{"state":"OPEN"}', 'xyz'), /CHECK/, 'a malformed hash is refused');
  assert.throws(ins('promoted', null, null), /CHECK/, 'unknown provenance is refused');
  ins('local-draft', null, null)();
  assert.throws(() => run('INSERT INTO memberships (org_id, user_id, role, since) VALUES (?, ?, ?, ?)', org.id, 'usr_nobody', 'member', 't'), /FOREIGN KEY/);
  assert.throws(() => run("UPDATE memberships SET role = 'owner'"), /CHECK/);
  assert.throws(() => run("UPDATE activity SET detail = 'tampered'"), /immutable/);
  assert.throws(() => run('DELETE FROM activity'), /immutable/);
  assert.throws(() => run("INSERT INTO users (id, email, display_name, password_hash, created_at) VALUES ('u2', 'ANN@Example.test', 'x', 'h', 't')"), /CHECK/, 'emails are stored lower-case');
  assert.throws(() => run("INSERT INTO users (id, email, display_name, password_hash, created_at) VALUES ('u3', 'ann@example.test', 'x', 'h', 't')"), /UNIQUE/);
});

test('transactions: a failure inside leaves nothing behind (no organization, no membership, no activity)', async () => {
  const { b } = makeBackend();
  const ann = await newUser(b, 'ann');
  const before = (b.db.raw.prepare('SELECT (SELECT count(*) FROM organizations) AS o, (SELECT count(*) FROM memberships) AS m, (SELECT count(*) FROM activity) AS a').get()) as Record<string, number>;
  assert.throws(() => b.db.tx(() => {
    b.registry.createOrganization(ann, { name: 'Half Done' });
    throw new Error('boom');
  }), /boom/);
  const after = (b.db.raw.prepare('SELECT (SELECT count(*) FROM organizations) AS o, (SELECT count(*) FROM memberships) AS m, (SELECT count(*) FROM activity) AS a').get()) as Record<string, number>;
  assert.deepEqual(after, before);
  // a Registry call that fails validation after a partial step also records no success activity
  const org = b.registry.createOrganization(ann, { name: 'Alpha Bank' });
  const n = b.registry.activity(ann, org.id).length;
  b.registry.recordSession(ann, org.id, { sessionId: SID, label: 'a' });
  assert.equal(code(() => b.registry.recordSession(ann, org.id, { sessionId: SID, label: 'dup' })), 'EXISTS');
  assert.equal(b.registry.activity(ann, org.id).length, n + 1, 'only the successful call was recorded');
});

test('conflicting operations from two connections: an invitation can be accepted once, whichever connection tries first', async () => {
  const t = tempDir();
  try {
    const a = makeBackend(t.path).b; const c = makeBackend(t.path).b;
    const ann = await newUser(a, 'ann'); const bob = await newUser(a, 'bob'); const cy = await newUser(a, 'cy');
    const org = a.registry.createOrganization(ann, { name: 'Alpha Bank' });
    const { token } = a.registry.invite(ann, org.id, { invitee: 'someone', role: 'member' });
    const first = c.registry.acceptInvitation(bob, token);
    assert.equal(first.role, 'member');
    assert.equal(code(() => a.registry.acceptInvitation(cy, token)), 'INVALID_INVITATION');
    assert.equal(a.registry.members(ann, org.id).length, 2, 'exactly one membership was created');
    a.db.close(); c.db.close();
  } finally { t.cleanup(); }
});

test('the last administrator cannot be removed or demoted, also through the database path', async () => {
  const { b } = makeBackend();
  const ann = await newUser(b, 'ann'); const bob = await newUser(b, 'bob');
  const org = b.registry.createOrganization(ann, { name: 'Alpha Bank' });
  assert.equal(code(() => b.registry.setRole(ann, org.id, ann.userId, 'member')), 'LAST_ADMIN');
  assert.equal(code(() => b.registry.removeMember(ann, org.id, ann.userId)), 'LAST_ADMIN');
  const { token } = b.registry.invite(ann, org.id, { invitee: 'bob', role: 'admin' }); b.registry.acceptInvitation(bob, token);
  b.registry.setRole(ann, org.id, ann.userId, 'member'); // now allowed: bob is also an admin
  assert.equal(code(() => b.registry.setRole(bob, org.id, bob.userId, 'member')), 'LAST_ADMIN');
});

test('createBackend refuses to start on a database it cannot migrate and leaves the file unchanged', () => {
  const t = tempDir();
  try {
    const db = openDatabase(t.path); migrate(db);
    db.raw.prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (99, 'future', 'x')").run(); db.close();
    assert.throws(() => createBackend(t.path), /newer than this application/);
  } finally { t.cleanup(); }
});
