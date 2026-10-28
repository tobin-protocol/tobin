// Validates release/RELEASE-GATES.json against the repository state and reports (or enforces) release readiness.
// It fails CLOSED: a gate is PASS only if the file records the required approval/evidence and the cross-checks agree with the tree.
// Modes:
//   node scripts/release/check-gates.mjs                      report; exits 1 only if the file is invalid or inconsistent
//   node scripts/release/check-gates.mjs --target <name>      enforce; exits 1 unless every gate required for <name> is PASS
//   options: --csv <path> (write the gate matrix), --include-untracked (also scan untracked, non-ignored files; local use before a commit)
// This script never publishes anything and never reads secrets. It is not legal advice and its result is not a licence finding.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { error, summary, warning } from '../ci/lib.mjs';

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const target = opt('--target');
const csvPath = opt('--csv');
const includeUntracked = args.includes('--include-untracked');

const data = JSON.parse(readFileSync('release/RELEASE-GATES.json', 'utf8'));
const problems = []; // file invalid or inconsistent: always fatal
const STATUSES = new Set(data.statuses);
const TARGETS = Object.keys(data.targets || {});
const today = new Date().toISOString().slice(0, 10);
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
const nonEmpty = (s) => typeof s === 'string' && s.trim().length > 0;
const notAi = (s) => !/claude|anthropic|assistant|\bai\b|\bbot\b|github-actions|automation|auto-approv/i.test(s);

if (data.schema_version !== 1) problems.push('unsupported schema_version');

function isAncestor(sha) {
  try { execFileSync('git', ['merge-base', '--is-ancestor', sha, 'HEAD'], { stdio: 'ignore' }); return true; } catch { return false; }
}

// Recorded policy change PC-1 (experimental, source-only publication). It is honoured only if the gate file carries a complete founder approval for it:
// it (a) lets a legal gate that sets review_standard "founder-attestation" be approved without a counsel review, and (b) replaces the
// public-source-release requirements G04, E01 and E05 by the source-only dependency standard G12. It never affects the other targets.
const pc1 = (data.policy_changes || []).find((x) => x.id === 'PC-1');
const pc1ok = Boolean(pc1 && nonEmpty(pc1.description) && pc1.approval && nonEmpty(pc1.approval.approved_by) && notAi(pc1.approval.approved_by) && isDate(pc1.approval.approved_on) && pc1.approval.approved_on <= today && nonEmpty(pc1.approval.decision_reference));
if (pc1 && !pc1ok) problems.push('PC-1: the policy change record is incomplete (needs description and a named founder approval with a past date and decision reference)');

// Pending re-approvals (pending_approvals in the gate file). Approvals are recorded for a defined scope of the source tree; when that scope grows (for
// example a new application is imported), the gates and policy changes listed in affects_gates stay NOT satisfied for the strict checks until a named,
// dated founder approval is recorded in the entry's resolution. Report mode keeps showing the recorded status and prints the pending entry.
const pendings = Array.isArray(data.pending_approvals) ? data.pending_approvals : [];
const pendingOpen = [];
for (const pa of pendings) {
  const r = pa.resolution;
  const resolved = pa.status === 'RESOLVED' && r && nonEmpty(r.approved_by) && notAi(r.approved_by) && isDate(r.approved_on) && r.approved_on <= today && nonEmpty(r.decision_reference);
  if (pa.status === 'RESOLVED' && !resolved) problems.push('pending approval ' + pa.id + ': marked RESOLVED without a complete named, dated resolution');
  if (!nonEmpty(pa.id) || !Array.isArray(pa.affects_gates) || !nonEmpty(pa.title)) problems.push('a pending_approvals entry needs id, title and affects_gates');
  if (!resolved) pendingOpen.push(pa);
}
const pendingFor = (id) => pendingOpen.filter((pa) => (pa.affects_gates || []).includes(id));

// Built-in minimum policy: the gate file may add gates or targets but can never delete a mandatory gate or drop it from a target.
const MINIMUM_STRICT = {
  'private-remote-backup': ['G09', 'G11'],
  'public-source-release': ['G01', 'G02', 'G03', 'G04', 'G05', 'G06', 'G07', 'G08', 'G09', 'G11', 'E01', 'E05'],
  'versioned-release': ['G01', 'G02', 'G03', 'G04', 'G05', 'G06', 'G07', 'G08', 'G09', 'G10', 'G11', 'E01', 'E02', 'E03', 'E04', 'E05'],
  production: ['G01', 'G02', 'G03', 'G04', 'G05', 'G06', 'G07', 'G08', 'G09', 'G10', 'G11', 'E01', 'E02', 'E03', 'E04', 'E05', 'P01', 'P02', 'P03', 'P04', 'P05'],
};
const MINIMUM = { ...MINIMUM_STRICT };
if (pc1ok) MINIMUM['public-source-release'] = ['G01', 'G02', 'G03', 'G05', 'G06', 'G07', 'G08', 'G09', 'G11', 'G12'];
for (const [t, req] of Object.entries(MINIMUM)) {
  if (!TARGETS.includes(t)) problems.push(`target "${t}" is missing from the gate file`);
  for (const id of req) {
    const g = data.gates.find((x) => x.id === id);
    if (!g) problems.push(`mandatory gate ${id} is missing`);
    else if (!(g.required_for || []).includes(t)) problems.push(`mandatory gate ${id} was removed from the "${t}" target`);
  }
}

// --- automated source-tree scan (input to gate G09; never sufficient on its own)
function scanTree() {
  const lsArgs = includeUntracked ? ['ls-files', '-z', '--cached', '--others', '--exclude-standard'] : ['ls-files', '-z'];
  const files = execFileSync('git', lsArgs, { encoding: 'utf8', maxBuffer: 1 << 26 }).split('\0').filter(Boolean)
    .filter((f) => !(includeUntracked && f.startsWith('archive/'))); // local, uncommitted archive is reported separately
  const findings = [];
  const badPath = /(^|\/)(auth-vectors|authvectors|auth-intent)|(^|\/)CLAUDE\.md$|phase-e|PHASE-E|phase-b|PHASE-B|(^|\/)m0-review(\/|$)|(^|\/)(node_modules|dist|target)\/|\.badge-profile|(^|\/)\.env|\.pem$|\.key$|^archive\//;
  // Synthetic test data only: fixture directories and the strkey codec test (all-zero / 0x..01 addresses, not deployed contracts).
  const fixtureDirs = /^(contracts\/clearing\/tests\/fixtures\/|packages\/mvp1-sdk\/test\/fixtures\/|packages\/mvp1-sdk\/test\/primitives\.test\.ts$)/;
  for (const f of files) {
    if (badPath.test(f)) findings.push(`excluded or unsuitable path tracked: ${f}`);
    let st; try { st = statSync(f); } catch { continue; }
    if (!st.isFile() || st.size > 3_000_000 || /\.(png|ico|wasm|gz|zip)$/i.test(f)) continue;
    const text = readFileSync(f, 'utf8');
    const rules = [
      [/\bS[A-Z2-7]{55}\b/, 'Stellar secret-seed-shaped string'],
      [/BEGIN [A-Z ]*PRIVATE KEY/, 'private key block'],
      [/[A-Za-z]:\\Users\\|\/c\/Users\/|\/home\/[a-z]/, 'absolute local user path'],
    ];
    for (const [re, label] of rules) if (re.test(text)) findings.push(`${label}: ${f}`);
    if (!fixtureDirs.test(f) && /\bC[A-Z2-7]{55}\b/.test(text)) findings.push(`contract-id-shaped string outside test fixtures: ${f}`);
  }
  return { count: files.length, findings };
}
const scan = scanTree();

// --- per-gate validation
const ids = new Set();
const state = new Map();
for (const g of data.gates) {
  const where = g.id || '(no id)';
  if (!/^[GEP]\d{2}$/.test(g.id || '')) problems.push(`${where}: bad id`);
  if (ids.has(g.id)) problems.push(`${where}: duplicate id`); ids.add(g.id);
  for (const k of ['name', 'category', 'kind', 'status', 'evidence_required', 'owner_or_reviewer']) if (!nonEmpty(g[k])) problems.push(`${where}: missing ${k}`);
  if (!STATUSES.has(g.status)) problems.push(`${where}: unknown status "${g.status}"`);
  if (!['human', 'legal', 'hybrid', 'automated'].includes(g.kind)) problems.push(`${where}: unknown kind`);
  if (!Array.isArray(g.required_for) || g.required_for.some((t) => !TARGETS.includes(t))) problems.push(`${where}: bad required_for`);
  if (g.valid_for !== undefined && (!Array.isArray(g.valid_for) || g.valid_for.some((t) => !TARGETS.includes(t)))) problems.push(`${where}: bad valid_for`);
  let effective = g.status;
  const reasons = [];
  if (g.status === 'PASS') {
    const human = g.kind !== 'automated';
    const a = g.approval;
    if (human) {
      if (!a || !nonEmpty(a.approved_by) || !notAi(a.approved_by)) problems.push(`${where}: PASS needs approval.approved_by (a named responsible person, not an automated or AI actor)`);
      if (!a || !isDate(a.approved_on) || a.approved_on > today) problems.push(`${where}: PASS needs approval.approved_on as a past or present YYYY-MM-DD date`);
      if (!a || !nonEmpty(a.decision_reference)) problems.push(`${where}: PASS needs approval.decision_reference`);
    }
    if (g.kind === 'legal' && !(g.review_standard === 'founder-attestation' && pc1ok)) {
      const l = g.legal_review;
      if (!l || !nonEmpty(l.reviewer) || !notAi(l.reviewer) || !isDate(l.reviewed_on) || l.reviewed_on > today || !nonEmpty(l.reference)) problems.push(`${where}: legal gate PASS needs legal_review {reviewer, reviewed_on, reference}`);
    }
    if (g.kind === 'automated' || g.kind === 'hybrid') {
      const e = g.evidence;
      const hosted = e && /^https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/actions\/runs\/\d+/.test(e.run_url || '') && /^[0-9a-f]{40}$/.test(e.commit_sha || '');
      if (g.kind === 'automated' && !hosted) problems.push(`${where}: automated gate PASS needs evidence.run_url (GitHub Actions run) and a 40-hex evidence.commit_sha`);
      if (hosted && (!isDate(e.recorded_on) || e.recorded_on > today)) problems.push(`${where}: hosted evidence needs recorded_on as a past or present YYYY-MM-DD date`);
      if (hosted && target && !isAncestor(e.commit_sha)) problems.push(`${where}: evidence.commit_sha is not an ancestor of HEAD in this checkout (record the tested commit; use a full-history checkout)`);
      if (g.kind === 'hybrid' && !(hosted || (e && nonEmpty(e.description)))) problems.push(`${where}: hybrid gate PASS needs recorded evidence`);
    }
    if (nonEmpty(g.blocked_by)) problems.push(`${where}: PASS while blocked_by is set`);
    // cross-checks with the repository state
    const license = existsSync('LICENSE') ? readFileSync('LICENSE', 'utf8') : '';
    if (g.id === 'G01' && /\[name of copyright owner\]|\[yyyy\]/.test(license)) problems.push('G01: PASS while LICENSE still contains the unfilled copyright placeholder');
    if (g.id === 'G06') {
      const sec = existsSync('SECURITY.md') ? readFileSync('SECURITY.md', 'utf8') : null;
      if (sec === null || /PENDING|DRAFT/i.test(sec)) problems.push('G06: PASS needs an adopted SECURITY.md without PENDING or DRAFT markers');
    }
    if (g.id === 'G05') {
      const n = g.notice_decision;
      if (!n || !['required', 'not-required'].includes(n.value) || !nonEmpty(n.basis)) problems.push('G05: PASS needs notice_decision {value: required|not-required, basis}');
      else if (n.value === 'required' && !existsSync('NOTICE')) problems.push('G05: notice_decision is required but no NOTICE file exists');
    }
    if (g.id === 'G03' && !nonEmpty(g.scope_decision)) problems.push('G03: PASS needs scope_decision');
    if (g.id === 'G02' && !nonEmpty(g.scope_decision)) problems.push('G02: PASS needs scope_decision');
    if (g.id === 'G08' && !['remain-excluded', 'reconsidered-and-approved'].includes(g.fixtures_decision)) problems.push('G08: PASS needs fixtures_decision remain-excluded or reconsidered-and-approved');
    if (g.id === 'G11' && !(a && nonEmpty(a.approved_action))) problems.push('G11: PASS needs approval.approved_action naming the exact action');
    if (g.id === 'G09') {
      if (scan.findings.length) { problems.push('G09: PASS while the automated scan has findings'); }
    }
  }
  if (g.id === 'G09') {
    if (scan.findings.length) { effective = 'FAIL'; reasons.push(`automated scan found ${scan.findings.length} issue(s)`); }
    else if (g.status === 'PASS') reasons.push('automated scan clean; human sign-off recorded');
    else reasons.push(`automated scan clean (${scan.count} files); human sign-off still required`);
  }
  if (g.status !== 'PASS' && nonEmpty(g.blocked_by)) reasons.push(g.blocked_by);
  for (const pa of pendingFor(g.id)) reasons.push('re-approval pending for the expanded scope (' + pa.id + ')');
  state.set(g.id, { gate: g, effective, reasons });
}

// --- report
const satisfied = (g, t) => state.get(g.id).effective === 'PASS' && (!Array.isArray(g.valid_for) || g.valid_for.includes(t)) && pendingFor(g.id).length === 0;
const labelFor = (g, t) => (!state.has(g.id) ? 'policy change PC-1: re-approval pending' : state.get(g.id).effective === 'PASS' && pendingFor(g.id).length ? 'PASS recorded for an earlier scope; re-approval pending (' + pendingFor(g.id).map((x) => x.id).join(', ') + ')' : state.get(g.id).effective === 'PASS' && !satisfied(g, t) ? 'PASS only for ' + g.valid_for.join(', ') + '; not valid here' : state.get(g.id).effective);
const rows = data.gates.map((g) => { const s = state.get(g.id); return `| ${g.id} | ${g.name} | ${g.kind} | **${s.effective}** | ${(g.required_for || []).join(', ')} |`; });
const byTarget = TARGETS.map((t) => {
  const need = data.gates.filter((g) => g.required_for.includes(t));
  const missing = need.filter((g) => !satisfied(g, t));
  // the source-only policy change PC-1 only holds for the scope it was approved for
  if (t === 'public-source-release' && pendingFor('PC-1').length) missing.push({ id: 'PC-1' });
  return { t, need: need.length, missing };
});
summary([
  '### Release gates (fail-closed; unresolved human decisions are never defaulted to PASS)',
  '| id | gate | kind | status | required for |', '|---|---|---|---|---|', ...rows, '',
  '| target | gates required | not yet PASS | result |', '|---|---|---|---|',
  ...byTarget.map((b) => `| ${b.t} | ${b.need} | ${b.missing.length} (${b.missing.map((m) => m.id).join(', ')}) | ${b.missing.length ? 'BLOCKED' : 'all required gates PASS (human approval for the exact action is still recorded under G11 only)'} |`), '',
  `Automated source-tree scan: ${scan.count} files, ${scan.findings.length} finding(s)${scan.findings.length ? ':\n' + scan.findings.map((f) => `- ${f}`).join('\n') : '.'} A clean scan does not pass G09 by itself.`,
  pendingOpen.length ? '\n**Pending re-approvals (strict checks stay blocked for the gates they list):**\n' + pendingOpen.map((pa) => '- ' + pa.id + ': ' + pa.title + ' (affects ' + (pa.affects_gates || []).join(', ') + ')').join('\n') : '',
  problems.length ? `\n**Gate file problems:**\n${problems.map((p) => `- ${p}`).join('\n')}` : '',
].join('\n'));

if (csvPath) {
  const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const cols = 'gate_id,gate_name,category,automated_or_human,current_status,evidence_required,blocking_scope,owner_or_reviewer,notes';
  const out = data.gates.map((g) => { const s = state.get(g.id); return [g.id, g.name, g.category, g.kind === 'automated' ? 'automated' : g.kind === 'hybrid' ? 'automated + human' : g.kind === 'legal' ? 'human (legal review)' : 'human', s.effective, g.evidence_required, g.required_for.join('; '), g.owner_or_reviewer, s.reasons.join(' | ')].map(q).join(','); });
  writeFileSync(csvPath, cols + '\n' + out.join('\n') + '\n');
}
for (const p of problems) error(p);
if (problems.length) process.exit(1);
if (target) {
  if (!TARGETS.includes(target)) { error(`unknown target "${target}"; known: ${TARGETS.join(', ')}`); process.exit(2); }
  const b = byTarget.find((x) => x.t === target);
  if (b.missing.length) { error(`release target "${target}" is blocked: ${b.missing.map((m) => `${m.id} (${labelFor(m, target)})`).join(', ')}`); process.exit(1); }
  console.log(`all gates required for "${target}" are PASS`);
} else {
  const blocked = byTarget.filter((b) => b.missing.length).map((b) => b.t);
  if (blocked.length) warning(`release gates: ${blocked.length} target(s) blocked (${blocked.join(', ')}); this is expected until the human decisions are recorded`);
}
