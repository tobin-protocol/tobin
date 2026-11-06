'use strict';
// Persistent record of what the signer has done. Properties:
//  * every write is atomic: a temporary file in the same directory is written, flushed and closed, then renamed over the state file;
//    a crash leaves either the old state or the new state, never a partial file;
//  * the temporary file is created exclusively with owner-only permissions where the platform supports them
//    (POSIX mode 0600; on Windows a best-effort `icacls` call restricts the file to the current user);
//  * after every write the file is read back and compared; a mismatch is an error, not a success;
//  * a missing, unreadable, malformed or inconsistent state file is a REFUSAL, never silently replaced by an empty state;
//  * an operation is recorded PENDING (with its transaction hash) BEFORE the transaction is submitted, so an interrupted
//    run can never leave a misleading "completed" record, and a later run reconciles the pending record with the chain.
const nodeFs = require('fs');
const crypto = require('crypto');
const path = require('path');
const { execFileSync } = require('child_process');

class StateError extends Error {}

const OPS = ['deploy', 'mint-C', 'mint-D'];
const STATUSES = ['PENDING', 'SUCCEEDED', 'FAILED', 'EXPIRED'];
const TOP_KEYS = ['version', 'network', 'admin', 'saltHex', 'predictedContractId', 'configSha256', 'operations'];
const OP_KEYS = ['operation', 'status', 'txHash', 'maxTime', 'submittedAt', 'updatedAt', 'ledger', 'reason', 'submission'];
// reason: why a record is FAILED or EXPIRED. submission: how the one submission attempt was answered (audit trail, set while PENDING).
const REASONS = ['ON_CHAIN_FAILED', 'SUBMISSION_REJECTED', 'SUBMISSION_REJECTED_WINDOW_CLOSED', 'WINDOW_PASSED_NOT_FOUND'];
const SUBMISSIONS = ['ENQUEUED', 'DUPLICATE', 'TRY_AGAIN_LATER', 'ERROR_RESPONSE', 'MALFORMED_RESPONSE', 'HASH_MISMATCH', 'THROWN'];

function validateState(s) {
  const bad = (m) => { throw new StateError(`state file invalid: ${m}`); };
  if (!s || typeof s !== 'object' || Array.isArray(s)) bad('not an object');
  if (JSON.stringify(Object.keys(s).sort()) !== JSON.stringify([...TOP_KEYS].sort())) bad('unexpected or missing fields');
  if (s.version !== 2) bad('unsupported version');
  if (s.network !== 'testnet') bad('network is not testnet');
  if (!Array.isArray(s.operations)) bad('operations is not a list');
  const seen = new Set();
  for (const o of s.operations) {
    if (!o || typeof o !== 'object') bad('operation record is not an object');
    for (const k of Object.keys(o)) if (!OP_KEYS.includes(k)) bad(`unexpected field ${k}`);
    if (!OPS.includes(o.operation)) bad('unknown operation');
    if (!STATUSES.includes(o.status)) bad('unknown status');
    if (!/^[0-9a-f]{64}$/.test(String(o.txHash))) bad('transaction hash malformed');
    if (o.reason !== undefined && (!REASONS.includes(o.reason) || (o.status !== 'FAILED' && o.status !== 'EXPIRED'))) bad('reason is not allowed here');
    if (o.submission !== undefined && !SUBMISSIONS.includes(o.submission)) bad('unknown submission label');
    if (seen.has(o.operation) && o.status !== 'FAILED' && o.status !== 'EXPIRED') bad('duplicate active record for an operation');
    if (o.status !== 'FAILED' && o.status !== 'EXPIRED') seen.add(o.operation);
  }
  return s;
}

// ---------- owner-only permission: applied AND verified by inspecting the resulting ACL ----------
// Windows: the ACL is set with icacls using the user's SID (not a name that could be ambiguous), inheritance is removed, and then
// the real ACL is read back with PowerShell/.NET (SIDs, so no dependence on the display language). The file counts as owner-only only
// if: inheritance is blocked, exactly one rule exists, it is an explicit Allow of FullControl for the current user's SID, and the
// file's owner is that SID. A failure of any step is an error (the caller refuses); the exit code of icacls is never trusted alone.
// Other platforms: mode 0600 is applied and the mode bits are checked.
const ACL_INSPECT_SCRIPT = [
  '$p = $env:TOBIN_ACL_PATH',
  '$acl = Get-Acl -LiteralPath $p',
  '$me = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value',
  '$rules = @($acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier]) | ForEach-Object { [pscustomobject]@{ sid = $_.IdentityReference.Value; type = [string]$_.AccessControlType; rights = [string]$_.FileSystemRights; inherited = [bool]$_.IsInherited } })',
  '[pscustomobject]@{ me = $me; owner = $acl.GetOwner([Security.Principal.SecurityIdentifier]).Value; protected = [bool]$acl.AreAccessRulesProtected; rules = $rules } | ConvertTo-Json -Compress -Depth 4',
].join('; ');

function inspectAcl(file, exec = execFileSync, env = process.env) {
  let out;
  try { out = exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ACL_INSPECT_SCRIPT], { encoding: 'utf8', windowsHide: true, env: { ...env, TOBIN_ACL_PATH: file } }); }
  catch { throw new StateError('could not inspect the file ACL'); }
  let a; try { a = JSON.parse(out); } catch { throw new StateError('the ACL inspection returned an unreadable answer'); }
  if (!a || typeof a.me !== 'string' || !Array.isArray(a.rules)) throw new StateError('the ACL inspection returned an unexpected shape');
  return a;
}

/** Pure judgement of an inspected ACL. */
function evaluateOwnerOnly(a) {
  const problems = [];
  if (a.protected !== true) problems.push('inheritance is not blocked');
  if (a.owner !== a.me) problems.push('the file owner is not the current user');
  if (a.rules.length !== 1) problems.push(`${a.rules.length} access rules present (expected exactly 1)`);
  for (const r of a.rules) {
    if (r.sid !== a.me) problems.push('a rule grants access to another principal');
    if (r.type !== 'Allow') problems.push('a rule is not an Allow rule');
    if (r.inherited) problems.push('a rule is inherited');
    if (!/FullControl/.test(String(r.rights))) problems.push('the user rule is not FullControl');
  }
  return { ok: problems.length === 0, problems };
}

function verifyOwnerOnly(file, { platform = process.platform, exec = execFileSync, fs = nodeFs } = {}) {
  if (platform !== 'win32') {
    if ((fs.statSync(file).mode & 0o077) !== 0) throw new StateError('file mode allows access to group or others');
    return { applied: true, how: 'posix mode 0600, verified' };
  }
  const v = evaluateOwnerOnly(inspectAcl(file, exec));
  if (!v.ok) throw new StateError(`owner-only access is not in place: ${v.problems.join('; ')}`);
  return { applied: true, how: 'ACL inspected: single explicit FullControl rule for the current user' };
}

function restrictOwnerOnly(file, { platform = process.platform, exec = execFileSync, fs = nodeFs } = {}) {
  if (platform !== 'win32') { fs.chmodSync(file, 0o600); return verifyOwnerOnly(file, { platform, exec, fs }); }
  const me = inspectAcl(file, exec).me;
  try { exec('icacls', [file, '/inheritance:r', '/grant:r', `*${me}:(F)`], { stdio: 'ignore', windowsHide: true }); }
  catch { throw new StateError('icacls failed; owner-only access could not be applied'); }
  return verifyOwnerOnly(file, { platform, exec, fs });   // the outcome is judged from the real ACL, not from the exit code
}
restrictOwnerOnly.verify = verifyOwnerOnly;

function createStore(file, { fs = nodeFs, randomHex = () => crypto.randomBytes(6).toString('hex'), restrict = restrictOwnerOnly } = {}) {
  function load() {
    let text;
    try { text = fs.readFileSync(file, 'utf8'); } catch { throw new StateError('state file is missing or unreadable'); }
    let parsed;
    try { parsed = JSON.parse(text); } catch { throw new StateError('state file is not valid JSON (possible interrupted write); refusing to continue'); }
    return validateState(parsed);
  }

  function writeAtomic(obj) {
    validateState(obj);
    const text = JSON.stringify(obj, null, 2);
    const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${randomHex()}.tmp`);
    let fd; let created = false;
    try {
      fd = fs.openSync(tmp, 'wx', 0o600); created = true;
      fs.writeSync(fd, text);
      fs.fsyncSync(fd);
      fs.closeSync(fd); fd = undefined;
      restrict(tmp);
      fs.renameSync(tmp, file);
    } catch (e) {
      try { if (fd !== undefined) fs.closeSync(fd); } catch { /* ignore */ }
      if (created) { try { fs.unlinkSync(tmp); } catch { /* ignore */ } }
      throw new StateError(`state write failed before completion (previous state kept): ${e && e.code ? e.code : 'error'}`);
    }
    if (typeof restrict.verify === 'function') {
      try { restrict.verify(file); } catch (e) { throw new StateError(`state written but owner-only access could not be confirmed: ${e.message}`); }
    }
    let back;
    try { back = fs.readFileSync(file, 'utf8'); } catch { throw new StateError('state written but cannot be read back'); }
    if (back !== text) throw new StateError('state read-back differs from what was written');
    return obj;
  }

  /** The state must belong to exactly this approved deployment. */
  function assertMatches(cfg, state = load()) {
    const want = { admin: cfg.F, saltHex: cfg.saltHex, predictedContractId: cfg.tokenId, configSha256: cfg.configSha256 };
    for (const [k, v] of Object.entries(want)) if (state[k] !== v) throw new StateError(`state ${k} differs from the pinned deployment configuration`);
    return state;
  }

  function init(cfg) {
    if (fs.existsSync(file)) throw new StateError('state already exists; refusing to overwrite it');
    return writeAtomic({ version: 2, network: 'testnet', admin: cfg.F, saltHex: cfg.saltHex, predictedContractId: cfg.tokenId, configSha256: cfg.configSha256, operations: [] });
  }

  const active = (state, op) => state.operations.find((o) => o.operation === op && o.status !== 'FAILED' && o.status !== 'EXPIRED');

  function markPending(cfg, op, { txHash, maxTime, now }) {
    const state = assertMatches(cfg);
    if (active(state, op)) throw new StateError(`${op} already has an active record`);
    state.operations.push({ operation: op, status: 'PENDING', txHash, maxTime: Number(maxTime), submittedAt: new Date(now * 1000).toISOString(), updatedAt: new Date(now * 1000).toISOString() });
    return writeAtomic(state);
  }

  function markResult(cfg, op, status, { ledger, now, reason }) {
    if (!STATUSES.includes(status) || status === 'PENDING') throw new StateError('invalid result status');
    const state = assertMatches(cfg);
    const rec = state.operations.find((o) => o.operation === op && o.status === 'PENDING');
    if (!rec) throw new StateError(`no pending record for ${op}`);
    rec.status = status; rec.updatedAt = new Date(now * 1000).toISOString();
    if (ledger !== undefined) rec.ledger = Number(ledger);
    if (reason !== undefined) rec.reason = reason;
    return writeAtomic(state);
  }

  /** Audit label for the single submission attempt (informational; the record stays PENDING). */
  function annotate(cfg, op, submission, now) {
    const state = assertMatches(cfg);
    const rec = state.operations.find((o) => o.operation === op && o.status === 'PENDING');
    if (!rec) throw new StateError(`no pending record for ${op}`);
    rec.submission = submission; rec.updatedAt = new Date(now * 1000).toISOString();
    return writeAtomic(state);
  }

  /**
   * A previous attempt that was REJECTED at submission is not proof that its signed envelope can never be submitted by someone
   * holding it. Until that envelope's validity window (plus margin) has passed, no new attempt for the same operation is allowed.
   */
  function blocking(state, op) {
    return state.operations.find((o) => o.operation === op && o.status === 'FAILED' && o.reason === 'SUBMISSION_REJECTED');
  }

  /** Called only after the network has shown that the rejected envelope's validity window is closed. */
  function resolveRejected(cfg, op, txHash, now) {
    const state = assertMatches(cfg);
    const rec = state.operations.find((o) => o.operation === op && o.txHash === txHash && o.status === 'FAILED' && o.reason === 'SUBMISSION_REJECTED');
    if (!rec) throw new StateError('no rejected record to resolve');
    rec.reason = 'SUBMISSION_REJECTED_WINDOW_CLOSED'; rec.updatedAt = new Date(now * 1000).toISOString();
    return writeAtomic(state);
  }

  return { load, init, assertMatches, markPending, markResult, annotate, blocking, resolveRejected, active, writeAtomic };
}

module.exports = { createStore, validateState, StateError, restrictOwnerOnly, verifyOwnerOnly, inspectAcl, evaluateOwnerOnly, OPS, STATUSES, REASONS, SUBMISSIONS };
