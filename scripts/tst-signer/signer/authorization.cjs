'use strict';
// Strict validation of the Soroban authorization entries of an approved transaction (revision 5).
//
// The expected entries are DERIVED FROM THE SIGNER'S OWN APPROVED SPECIFICATION (the same pinned configuration that builds the
// transaction), never from the simulation. The entries found in the simulation response or in the assembled transaction are then
// decoded with the pinned SDK's XDR types and compared with the expected ones in three independent ways:
//   1. explicit structural checks (entry count, credential kind, function kind, contract / deployer / salt / Wasm hash, function name,
//      argument count, argument types and values, and every nested invocation, recursively);
//   2. a canonical description of the whole invocation tree, compared field by field with the description of the expected tree;
//   3. a byte-for-byte comparison of the canonical XDR of each entry.
// Anything unknown (an unsupported credential kind, function kind, ScVal type, extra field, undecodable XDR) is refused. Nothing is
// normalised into an accepted shape. The approved specification requires EXACTLY ONE entry per transaction, so there is no accepted
// ordering of several entries: any second, duplicated or reordered entry is an extra entry and is refused.
const { Refusal, redact } = require('./refusal.cjs');

const fail = (msg) => { throw new Refusal(redact(`authorization: ${msg}`)); };
const MAX_DEPTH = 8;

// ---------------- expected entries, from the specification ----------------
/**
 * spec = { kind: 'deploy', deployer, salt (Buffer), wasmHash (hex), minter, cap (bigint), decimals, name, symbol }
 *      | { kind: 'mint', contract (C...), to (G...), amount (bigint) }
 * Builds the SorobanAuthorizationEntry that Soroban records for that call when the source account is the authorizer.
 */
function buildExpectedAuthEntry(S, spec) {
  const x = S.xdr;
  const addr = (a) => new S.Address(a).toScAddress();
  const i128 = (v) => S.nativeToScVal(v, { type: 'i128' });
  let fn;
  if (spec.kind === 'deploy') {
    fn = x.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeCreateContractV2HostFn(new x.CreateContractArgsV2({
      contractIdPreimage: x.ContractIdPreimage.contractIdPreimageFromAddress(new x.ContractIdPreimageFromAddress({ address: addr(spec.deployer), salt: spec.salt })),
      executable: x.ContractExecutable.contractExecutableWasm(Buffer.from(spec.wasmHash, 'hex')),
      constructorArgs: [new S.Address(spec.minter).toScVal(), i128(spec.cap), S.nativeToScVal(spec.decimals, { type: 'u32' }),
        S.nativeToScVal(spec.name, { type: 'string' }), S.nativeToScVal(spec.symbol, { type: 'string' })],
    }));
  } else if (spec.kind === 'mint') {
    fn = x.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(new x.InvokeContractArgs({
      contractAddress: addr(spec.contract), functionName: 'mint', args: [new S.Address(spec.to).toScVal(), i128(spec.amount)],
    }));
  } else fail('unknown specification kind');
  return new x.SorobanAuthorizationEntry({
    credentials: x.SorobanCredentials.sorobanCredentialsSourceAccount(),
    rootInvocation: new x.SorobanAuthorizedInvocation({ function: fn, subInvocations: [] }),
  });
}

/** The entries the approved transaction requires: always exactly one, derived from the pinned configuration. */
function expectedAuthorizationEntries(S, cfg, opName) {
  if (opName === 'deploy') {
    return [buildExpectedAuthEntry(S, { kind: 'deploy', deployer: cfg.F, salt: cfg.salt, wasmHash: cfg.wasmHash, minter: cfg.F, cap: cfg.cap, decimals: cfg.decimals, name: cfg.name, symbol: cfg.symbol })];
  }
  if (opName === 'mint-C') return [buildExpectedAuthEntry(S, { kind: 'mint', contract: cfg.tokenId, to: cfg.C, amount: cfg.mintC })];
  if (opName === 'mint-D') return [buildExpectedAuthEntry(S, { kind: 'mint', contract: cfg.tokenId, to: cfg.D, amount: cfg.mintD })];
  return fail(`no authorization specification exists for operation "${opName}"; it stays blocked`);
}

// ---------------- decoding and canonical description ----------------
const keysOf = (o) => Object.keys(o).sort().join(',');
const requireKeys = (o, keys, what) => {
  if (o === null || typeof o !== 'object' || Array.isArray(o)) fail(`${what} is not an object`);
  if (keysOf(o) !== [...keys].sort().join(',')) fail(`${what} has unexpected or missing fields (${keysOf(o)})`);
};
function bytesOf(v, what) {
  if (v instanceof Uint8Array) return Buffer.from(v);
  if (v && typeof v === 'object' && 'value' in v) return bytesOf(v.value, what);
  if (v && typeof v === 'object' && 'bytes' in v) return bytesOf(v.bytes, what);
  return fail(`${what} is not a byte string`);
}
function addressOf(S, sc, what, allowed) {
  let a;
  try { a = S.Address.fromScAddress(sc); } catch { return fail(`${what} is not a supported address`); }
  const s = a.toString();
  if (!allowed.test(s)) fail(`${what} has an unexpected address kind`);
  return s;
}

/** Canonical description of one argument; only the argument types the approved calls use are supported. */
function describeScVal(S, v, what) {
  if (!v || typeof v !== 'object' || typeof v.type !== 'string') return fail(`${what} is not a value`);
  switch (v.type) {
    case 'scvAddress': return { t: 'address', v: addressOf(S, v.address, what, /^[GC]/) };
    case 'scvI128': { const n = S.scValToNative(S.xdr.ScVal.fromXDR(v.toXDR('base64'), 'base64')); return { t: 'i128', v: BigInt(n).toString() }; }
    case 'scvU32': return { t: 'u32', v: Number(v.u32) };
    case 'scvString': return { t: 'string', v: Buffer.from(bytesOf(v.str, what)).toString('utf8') };
    default: return fail(`${what} has an unsupported value type (${v.type})`);
  }
}

/** Canonical description of an invocation tree, recursively. Unknown variants and extra fields are refused. */
function describeInvocation(S, inv, depth = 0, path = 'root') {
  if (depth > MAX_DEPTH) fail('invocation tree is too deep');
  requireKeys(inv, ['function', 'subInvocations'], `${path} invocation`);
  if (!Array.isArray(inv.subInvocations)) fail(`${path} sub-invocations are not a list`);
  const f = inv.function;
  let fn;
  if (f && f.type === 'sorobanAuthorizedFunctionTypeContractFn') {
    requireKeys(f, ['type', 'contractFn'], `${path} function`);
    const c = f.contractFn; requireKeys(c, ['contractAddress', 'functionName', 'args'], `${path} contract call`);
    if (!Array.isArray(c.args)) fail(`${path} arguments are not a list`);
    fn = { kind: 'contractFn', contract: addressOf(S, c.contractAddress, `${path} contract`, /^C/), name: Buffer.from(bytesOf(c.functionName, `${path} function name`)).toString('utf8'), args: c.args.map((a, i) => describeScVal(S, a, `${path} argument ${i}`)) };
  } else if (f && f.type === 'sorobanAuthorizedFunctionTypeCreateContractV2HostFn') {
    requireKeys(f, ['type', 'createContractV2HostFn'], `${path} function`);
    const a = f.createContractV2HostFn; requireKeys(a, ['contractIdPreimage', 'executable', 'constructorArgs'], `${path} deployment`);
    const pre = a.contractIdPreimage;
    if (!pre || pre.type !== 'contractIdPreimageFromAddress') fail(`${path} deployment preimage kind is not supported`);
    requireKeys(pre, ['type', 'fromAddress'], `${path} preimage`); requireKeys(pre.fromAddress, ['address', 'salt'], `${path} preimage address`);
    const ex = a.executable;
    if (!ex || ex.type !== 'contractExecutableWasm') fail(`${path} executable kind is not supported`);
    requireKeys(ex, ['type', 'wasmHash'], `${path} executable`);
    if (!Array.isArray(a.constructorArgs)) fail(`${path} constructor arguments are not a list`);
    fn = { kind: 'createV2', deployer: addressOf(S, pre.fromAddress.address, `${path} deployer`, /^G/), salt: bytesOf(pre.fromAddress.salt, 'salt').toString('hex'),
      wasm: bytesOf(ex.wasmHash, 'Wasm hash').toString('hex'), ctor: a.constructorArgs.map((v, i) => describeScVal(S, v, `${path} constructor argument ${i}`)) };
  } else fail(`${path} function kind is not supported (${f && f.type})`);
  return { fn, subs: inv.subInvocations.map((s, i) => describeInvocation(S, s, depth + 1, `${path}.sub[${i}]`)) };
}

/** Decodes an entry from an XDR object, base64 text or bytes, strictly; failure is a refusal. */
function decodeAuthorizationEntry(S, raw) {
  let b64;
  try {
    if (typeof raw === 'string') b64 = raw;
    else if (raw instanceof Uint8Array) b64 = Buffer.from(raw).toString('base64');
    else b64 = raw.toXDR('base64');
    const entry = S.xdr.SorobanAuthorizationEntry.fromXDR(b64, 'base64');
    if (entry.toXDR('base64') !== b64) fail('entry does not re-encode to the same bytes (non-canonical or trailing data)');
    return { entry, b64 };
  } catch (e) {
    if (e instanceof Refusal) throw e;
    return fail('an authorization entry cannot be decoded');
  }
}

function firstDifference(a, b, path = '') {
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return a === b ? null : (path || 'value');
  if (Array.isArray(a) !== Array.isArray(b)) return path || 'value';
  if (Array.isArray(a)) { if (a.length !== b.length) return `${path}.length`; for (let i = 0; i < a.length; i++) { const d = firstDifference(a[i], b[i], `${path}[${i}]`); if (d) return d; } return null; }
  const ka = Object.keys(a).sort(); const kb = Object.keys(b).sort();
  if (ka.join() !== kb.join()) return `${path}{fields}`;
  for (const k of ka) { const d = firstDifference(a[k], b[k], path ? `${path}.${k}` : k); if (d) return d; }
  return null;
}

/** Layers 1 and 2: describe both invocation trees (explicit, recursive, fail-closed) and compare them field by field. */
function structuralCompare(S, actualEntry, expectedEntry, i = 0) {
  const actual = describeInvocation(S, actualEntry.rootInvocation);
  const want = describeInvocation(S, expectedEntry.rootInvocation);
  const diff = firstDifference(actual, want);
  if (diff) fail(`entry ${i} differs from the approved invocation at ${diff}`);
  return actual;
}

/** Layer 3: the canonical XDR of the entry must equal the canonical XDR of the expected entry. */
function bytesCompare(actualB64, expectedEntry, i = 0) {
  if (actualB64 !== expectedEntry.toXDR('base64')) fail(`entry ${i} differs from the approved entry in its canonical bytes`);
}

/**
 * Validates `entries` (the authorization entries of a simulation response or of an assembled transaction) against the specification.
 * Throws a Refusal on the first problem; returns the decoded canonical descriptions otherwise. Deterministic and side-effect free.
 */
function validateAuthorizationEntries(S, cfg, opName, entries) {
  const expected = expectedAuthorizationEntries(S, cfg, opName);
  if (!Array.isArray(entries)) fail('the authorization entries are not a list');
  if (entries.length < expected.length) fail(`missing authorization entry (expected ${expected.length}, found ${entries.length})`);
  if (entries.length > expected.length) {
    const decoded = entries.map((e) => { try { return decodeAuthorizationEntry(S, e).b64; } catch { return null; } });
    const dup = decoded.some((d, i) => d !== null && decoded.indexOf(d) !== i);
    fail(`${dup ? 'duplicate' : 'unexpected additional'} authorization entries (expected ${expected.length}, found ${entries.length})`);
  }
  const out = [];
  entries.forEach((raw, i) => {
    const { entry, b64 } = decodeAuthorizationEntry(S, raw);
    requireKeys(entry, ['credentials', 'rootInvocation'], `entry ${i}`);
    const kind = entry.credentials && entry.credentials.type;
    if (kind !== 'sorobanCredentialsSourceAccount') fail(`only source-account authorization is allowed (unsupported credential kind: ${kind})`);
    requireKeys(entry.credentials, ['type'], `entry ${i} credentials`);
    out.push(structuralCompare(S, entry, expected[i], i));   // layers 1 and 2: explicit checks and canonical description
    bytesCompare(b64, expected[i], i);                       // layer 3: canonical XDR bytes
  });
  return out;
}

module.exports = { buildExpectedAuthEntry, expectedAuthorizationEntries, decodeAuthorizationEntry, describeInvocation, describeScVal, structuralCompare, bytesCompare, validateAuthorizationEntries, firstDifference, MAX_DEPTH };
