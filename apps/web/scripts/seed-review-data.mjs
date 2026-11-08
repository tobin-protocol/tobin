// Seeds a THROWAWAY console backend (default http://127.0.0.1:8787) through its real API with FICTIONAL people (Alice, Bob, Carol) and the documented arithmetic example. For review screenshots only.
const B = process.env.TOBIN_API_URL ?? 'http://127.0.0.1:8787';
const PW = 'Correct-horse-battery-1';
async function call(cookie, method, path, body) {
  const headers = {};
  if (method === 'POST') { headers['content-type'] = 'application/json'; headers['x-tobin-request'] = '1'; }
  if (cookie) headers.cookie = cookie;
  const r = await fetch(B + path, { method, headers, body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch { /* */ }
  if (!r.ok) throw new Error(`${method} ${path} -> ${r.status} ${text.slice(0, 200)}`);
  const sc = r.headers.getSetCookie().map((c) => c.split(';')[0]).find((c) => c.startsWith('tobin_session='));
  return { json, cookie: sc };
}
const user = async (name) => {
  const email = `${name.toLowerCase()}@example.test`;
  const r = await call(null, 'POST', '/api/auth/register', { email, password: PW, displayName: name });
  const me = (await call(r.cookie, 'GET', '/api/auth/me')).json;
  return { name, email, cookie: r.cookie, id: me.user.id };
};

const alice = await user('Alice'); const bob = await user('Bob'); const carol = await user('Carol');
const org = (await call(alice.cookie, 'POST', '/api/registry/orgs', { name: 'Alpha Bank', description: 'Fictional institution used for the Phase A review.', visibility: 'private', institutionType: 'bank', jurisdiction: 'GB' })).json.organization;
const O = `/api/registry/orgs/${org.id}`;
for (const u of [bob, carol]) {
  const inv = (await call(alice.cookie, 'POST', `${O}/invitations`, { invitee: u.email, role: 'member' })).json;
  await call(u.cookie, 'POST', '/api/registry/invitations/accept', { token: inv.token });
}
await call(alice.cookie, 'POST', `${O}/reviewers/${bob.id}/grant`);
await call(alice.cookie, 'POST', `${O}/invitations`, { invitee: 'dave@example.test', role: 'member' }); // stays pending

const newSession = async (label) => (await call(alice.cookie, 'POST', `${O}/sessions`, { label })).json.session.sessionId;
const addAll = async (sid) => { for (const u of [alice, bob, carol]) await call(alice.cookie, 'POST', `${O}/sessions/${sid}/participants`, { userId: u.id }); };
const ob = (sid, d, c, amount, reference) => call(alice.cookie, 'POST', `${O}/sessions/${sid}/obligations`, { debtor: d.id, creditor: c.id, amount, asset: 'USD', reference });

// optional filler sessions, created FIRST so the seeded ones stay among the newest 10 the Overview reads (SEED_EXTRA_SESSIONS=8 gives 11 in total: two list pages)
for (let i = 0; i < Number(process.env.SEED_EXTRA_SESSIONS ?? 0); i++) await newSession(`Weekly netting ${i + 1}`);

// 1: calculated and awaiting review (Bob is the reviewer)
const s1 = await newSession('Q4 clearing run'); await addAll(s1);
await ob(s1, alice, bob, '100', 'invoice 1'); await ob(s1, bob, carol, '80', 'invoice 2'); await ob(s1, carol, alice, '70', 'invoice 3');
await call(alice.cookie, 'POST', `${O}/sessions/${s1}/calculate`);

// 2: calculated, then changed: the calculation is stale (needs the administrator)
const s2 = await newSession('Monthly settlement'); await addAll(s2);
await ob(s2, alice, carol, '250', 'rent'); await ob(s2, carol, bob, '40', 'fees');
await call(alice.cookie, 'POST', `${O}/sessions/${s2}/calculate`);
await ob(s2, bob, alice, '15', 'late addition');

// 3: an empty draft
await newSession('Draft run');

console.log(JSON.stringify({ org: org.id, users: { alice: alice.email, bob: bob.email, carol: carol.email }, password: PW, sessions: [s1, s2] }));
