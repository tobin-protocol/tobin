// The initial configuration transaction of the Testnet administrative multisig account: build it, and check a signed copy before submission.
//   node scripts/multisig/setup-tx.mjs build  [--out file]      build the UNSIGNED atomic transaction and print every detail (needs the account to exist)
//   node scripts/multisig/setup-tx.mjs verify <signed.xdr|XDR>  check a signed envelope against the approved configuration (one read of the current sequence)
// Never reads or asks for a secret and never submits: signing happens on the founder's own device, and submission is a separate, explicit step.
// Order of operations: the three add-signer operations first, the threshold operation LAST. While thresholds are still 0 the master key (weight 1) is
// enough for every operation, and no operation follows the one that raises the thresholds. The master key weight is not touched.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { arg, lookup, MANIFEST, readJson, WEIGHTS } from './lib.mjs';
import { decodeEnvelope, envelopeHash, PASSPHRASE, rawPublicKey, verifySignature } from './signature-tools.mjs';

const RPC = 'https://soroban-testnet.stellar.org';
const ROLES = ['founder', 'technical', 'security'];
const run = (args, input) => execFileSync('stellar', args, { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();

/** The expected (approved) operations, in order, from the manifest. */
export function expectedOperations(manifest) {
  const signers = Object.fromEntries(manifest.signers.map((s) => [s.role, s.publicKey]));
  return {
    signers: ROLES.map((r) => ({ key: signers[r], weight: WEIGHTS[r], role: r })),
    thresholds: manifest.thresholds,
  };
}

/** Checks a DECODED setup envelope against the approved configuration. Pure: no network, no secrets. Returns { check, ok, detail } rows. */
export function checkSetupEnvelope(env, hash, { account, expected, expectedHash, expectedSequence, expectedFee = 400 }) {
  const rows = [];
  const add = (check, ok, detail) => rows.push({ check, ok: Boolean(ok), detail });
  const v1 = env && env.tx && env.tx.tx ? env.tx : null;
  add('decodes as a v1 transaction envelope', v1, '');
  if (!v1) return rows;
  const t = v1.tx;
  add('transaction hash equals the expected hash (Testnet passphrase)', !expectedHash || hash === expectedHash, `${hash}`);
  add('source account is the administrative account', t.source_account === account, t.source_account);
  add('sequence number is the account sequence + 1', expectedSequence === undefined || String(t.seq_num) === String(expectedSequence), `${t.seq_num}, expected ${expectedSequence}`);
  add('fee is 100 stroops per operation (400 in total)', t.fee === expectedFee, `${t.fee}`);
  add('no memo, no time bounds or other preconditions', t.memo === 'none' && t.cond === 'none', `${JSON.stringify(t.memo)} ${JSON.stringify(t.cond)}`);
  const ops = t.operations || [];
  add('exactly four operations', ops.length === 4, `${ops.length}`);
  // An operation is "only" the given fields when its source is the transaction source and every other set_options field is null.
  const only = (o, keys) => Boolean(o) && o.source_account === null && Boolean(o.body && o.body.set_options) && Object.entries(o.body.set_options).every(([k, v]) => keys.includes(k) || v === null);
  expected.signers.forEach((s, i) => {
    const so = ops[i] && ops[i].body && ops[i].body.set_options;
    add(`operation ${i + 1}: add ${s.role} (weight ${s.weight}) and nothing else`, only(ops[i], ['signer']) && so.signer && so.signer.key === s.key && so.signer.weight === s.weight, JSON.stringify(so && so.signer));
  });
  const th = ops[3] && ops[3].body && ops[3].body.set_options;
  add('operation 4: thresholds low 5, medium 6, high 7 and nothing else (master weight untouched)', only(ops[3], ['low_threshold', 'med_threshold', 'high_threshold']) && th.low_threshold === expected.thresholds.low && th.med_threshold === expected.thresholds.medium && th.high_threshold === expected.thresholds.high, JSON.stringify(th));
  const sigs = v1.signatures || [];
  const hint = rawPublicKey(account).subarray(-4).toString('hex');
  const mine = sigs.filter((s) => s.hint === hint);
  add('exactly one signature, attached to the envelope', sigs.length === 1, `${sigs.length}`);
  add('its hint resolves to the administrative (master) key', mine.length === 1, `hint ${hint}`);
  add('it is a valid ed25519 signature of the transaction hash by the master key', mine.length === 1 && verifySignature(hash, mine[0].signature, account), '');
  return rows;
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const m = readJson(MANIFEST);
  const account = m.bootstrapAccount.publicKey;
  const expected = expectedOperations(m);
  const net = ['--network-passphrase', PASSPHRASE, '--rpc-url', RPC];
  if (cmd === 'build') {
    const a = await lookup(account);
    if (a.state !== 'exists') throw new Error('the account does not exist on Testnet');
    let xdr = run(['tx', 'new', 'set-options', '--source-account', account, '--signer', expected.signers[0].key, '--signer-weight', String(expected.signers[0].weight), '--fee', '400', '--build-only', ...net]);
    for (const s of expected.signers.slice(1)) xdr = run(['tx', 'op', 'add', 'set-options', '--source-account', account, '--signer', s.key, '--signer-weight', String(s.weight), ...net], xdr);
    xdr = run(['tx', 'op', 'add', 'set-options', '--source-account', account, '--low-threshold', String(expected.thresholds.low), '--med-threshold', String(expected.thresholds.medium), '--high-threshold', String(expected.thresholds.high), ...net], xdr);
    const env = decodeEnvelope(xdr);
    const t = env.tx.tx;
    console.log(`Network: Stellar Testnet\nPassphrase: ${PASSPHRASE}\nSource account: ${t.source_account}\nCurrent on-chain sequence: ${a.account.sequence}\nTransaction sequence: ${t.seq_num}\nFee: ${t.fee} stroops (4 operations x 100)\nCurrent signers: ${a.account.signers.map((s) => `${s.key}=${s.weight}`).join(', ')}; current thresholds: ${JSON.stringify(a.account.thresholds)}`);
    t.operations.forEach((o, i) => console.log(`Operation ${i + 1}: set_options ${JSON.stringify(Object.fromEntries(Object.entries(o.body.set_options).filter(([, v]) => v !== null)))}`));
    console.log('Expected resulting signers: master 1, founder 5, technical 2, security 1\nExpected thresholds: low 5, medium 6, high 7\nExpected master key weight: 1 (unchanged)');
    // Self-check of the unsigned transaction against the approved configuration (signature rows are expected to fail while unsigned).
    const rows = checkSetupEnvelope(env, envelopeHash(xdr), { account, expected, expectedSequence: BigInt(a.account.sequence) + 1n }).filter((r) => !r.ok && !/signature|hint/.test(r.check));
    if (rows.length) throw new Error('built transaction does not match the approved configuration: ' + rows.map((r) => r.check).join('; '));
    console.log(`Hash: ${envelopeHash(xdr)}\n\nUnsigned XDR:\n${xdr}`);
    const out = arg('--out', rest);
    if (out) writeFileSync(out, xdr + '\n');
  } else if (cmd === 'verify') {
    const given = rest.find((x) => !x.startsWith('--') && x !== arg('--hash', rest));
    const xdr = (/^[A-Za-z0-9+/=]{60,}$/.test(given || '') ? given : readFileSync(given, 'utf8')).trim();
    const a = await lookup(account);
    if (a.state !== 'exists') throw new Error('the account does not exist on Testnet');
    const rows = checkSetupEnvelope(decodeEnvelope(xdr), envelopeHash(xdr), { account, expected, expectedHash: arg('--hash', rest), expectedSequence: BigInt(a.account.sequence) + 1n });
    for (const r of rows) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.check}${r.detail ? ': ' + r.detail : ''}`);
    const ok = rows.every((r) => r.ok);
    console.log(ok ? 'VALID: matches the approved configuration and carries a genuine master-key signature' : 'NOT VALID: do not submit');
    process.exitCode = ok ? 0 : 1;
  } else {
    console.error('usage: setup-tx.mjs build [--out file] | verify <signed.xdr|XDR> [--hash H]');
    process.exitCode = 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
