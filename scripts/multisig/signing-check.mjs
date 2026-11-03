// Secret-free signing workflow check.
//   node scripts/multisig/signing-check.mjs build  [--account G...]   print a harmless, unsubmittable unsigned envelope for the founder to sign locally
//   node scripts/multisig/signing-check.mjs verify <signed.xdr | -> [--account G...]   verify the signature on it against the public key
// The "build" envelope is deliberately inert: sequence number 1 (an existing account's sequence is vastly larger, so any submission fails with
// tx_bad_seq), a bump-sequence-to-0 operation, and a memo saying not to send it. Signing it proves the founder's signing path works, exposes no
// secret, and cannot change anything on the network. This tool never reads or asks for a secret key.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { checkSignedEnvelope, decodeEnvelope, envelopeHash, PASSPHRASE } from './signature-tools.mjs';
import { arg, MANIFEST, readJson } from './lib.mjs';

/** The same envelope without signatures (so the hash it is compared against does not come from the thing being checked). */
function unsignedOf(xdr) {
  const env = decodeEnvelope(xdr);
  env.tx.signatures = [];
  return execFileSync('stellar', ['xdr', 'encode', '--type', 'TransactionEnvelope', '--input', 'json', '--output', 'single-base64'], { input: JSON.stringify(env), encoding: 'utf8' }).trim();
}

const [cmd, ...rest] = process.argv.slice(2);
const m = readJson(MANIFEST);
const account = arg('--account', rest) || m.bootstrapAccount.publicKey;

if (cmd === 'build') {
  const json = {
    tx: { tx: { source_account: account, fee: 100, seq_num: 1, cond: 'none', memo: { text: 'tobin-sign-check-do-not-send' }, operations: [{ source_account: null, body: { bump_sequence: { bump_to: 0 } } }], ext: 'v0' }, signatures: [] },
  };
  const xdr = execFileSync('stellar', ['xdr', 'encode', '--type', 'TransactionEnvelope', '--input', 'json', '--output', 'single-base64'], { input: JSON.stringify(json), encoding: 'utf8' }).trim();
  console.log(`network: ${PASSPHRASE}\nsource: ${account}\nfee: 100 stroops\nsequence: 1 (inert: it can never be valid)\noperation: bump_sequence to 0\nmemo: tobin-sign-check-do-not-send\nhash: ${envelopeHash(xdr)}\n\nunsigned XDR:\n${xdr}`);
} else if (cmd === 'verify') {
  // The signed envelope may be given inline (base64 XDR), as a file path, or as - for standard input.
  const given = rest.find((a) => !a.startsWith('--') && a !== account && a !== arg('--hash', rest));
  const raw = given === '-' ? readFileSync(0, 'utf8') : /^[A-Za-z0-9+/=]{40,}$/.test(given || '') ? given : readFileSync(given, 'utf8');
  const xdr = raw.trim();
  const expectedHash = arg('--hash', rest) || envelopeHash(unsignedOf(xdr));
  const rows = checkSignedEnvelope(decodeEnvelope(xdr), envelopeHash(xdr), { publicKey: account, expectedHash });
  for (const r of rows) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.check}: ${r.detail}`);
  const ok = rows.every((r) => r.ok);
  console.log(ok ? `VALID: the envelope carries a genuine signature from ${account}` : `NOT VALID: see the failed checks above`);
  process.exitCode = ok ? 0 : 1;
} else {
  console.error('usage: signing-check.mjs build | verify <signed.xdr|->');
  process.exitCode = 2;
}
