// Deploy and exercise the governed Tobin Testnet token: a new instance of the existing token Wasm whose minter is the administrative multisig account.
//   node scripts/multisig/governed-token.mjs build-deploy [--out file]
//   node scripts/multisig/governed-token.mjs verify-deploy <signed.xdr|XDR> [--signers founder,security]
//   node scripts/multisig/governed-token.mjs build-mint --token C... --to G... --amount N [--out file]
//   node scripts/multisig/governed-token.mjs verify-mint <signed.xdr|XDR> --token C... --to G... --amount N --signers founder,security
//   node scripts/multisig/governed-token.mjs submit <signed.xdr|XDR>        (a separate, explicit step: only submits what was verified)
// Testnet only. It never reads, asks for or prints a secret: transactions are built unsigned, signed on the founder's own device, and checked here
// (exact operation, parameters, source, sequence, fee and a genuine ed25519 signature from each required signer) before anything is submitted.
// Idempotent by construction: the salt is fixed, so the contract ID is fixed; build-deploy refuses when that instance already exists on-chain.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { crc16 } from '../accounts/check-accounts.mjs';
import { arg, lookup, MANIFEST, readJson } from './lib.mjs';
import { decodeEnvelope, envelopeHash, PASSPHRASE, verifySignature } from './signature-tools.mjs';

const RPC = 'https://soroban-testnet.stellar.org';
export const WASM_HASH = 'ef483732039f0ca62665b92b816c3a12dcf094c707f77e1edc53e60ea083241f'; // the audited token Wasm, already uploaded on Testnet
export const SALT = createHash('sha256').update('tobin-test-token-governed-v1').digest('hex');
/** The token's initialization parameters: exactly those of the existing token (contracts/deployments/testnet.json), minter aside. */
export const PARAMS = { cap: '10000000000000', decimals: 7, name: 'Tobin Test Token', symbol: 'TTT' };
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const net = ['--network-passphrase', PASSPHRASE, '--rpc-url', RPC];
const run = (args, input) => execFileSync('stellar', args, { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();

function strkey(version, raw) {
  const payload = Buffer.concat([Buffer.from([version << 3]), raw]);
  const c = crc16(payload);
  const bytes = Buffer.concat([payload, Buffer.from([c & 0xff, c >> 8])]);
  let bits = 0, acc = 0, s = '';
  for (const b of bytes) { acc = (acc << 8) | b; bits += 8; while (bits >= 5) { bits -= 5; s += B32[(acc >> bits) & 31]; } }
  return s;
}

/** The contract ID that a deploy from `deployer` with `salt` will create (the protocol's ContractId preimage hash), computed independently of the CLI. */
export function predictContractId(deployer, salt = SALT) {
  const networkId = createHash('sha256').update(PASSPHRASE).digest('hex');
  const json = { contract_id: { network_id: networkId, contract_id_preimage: { address: { address: deployer, salt } } } };
  const xdr = run(['xdr', 'encode', '--type', 'HashIdPreimage', '--input', 'json', '--output', 'single-base64'], JSON.stringify(json));
  return strkey(2, createHash('sha256').update(Buffer.from(xdr, 'base64')).digest());
}

async function instanceExists(contractId) {
  const key = run(['xdr', 'encode', '--type', 'LedgerKey', '--input', 'json', '--output', 'single-base64'], JSON.stringify({ contract_data: { contract: contractId, key: 'ledger_key_contract_instance', durability: 'persistent' } }));
  const res = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getLedgerEntries', params: { keys: [key] } }) });
  const j = await res.json();
  return Boolean(j.result && j.result.entries && j.result.entries.length);
}

const admin = () => readJson(MANIFEST).bootstrapAccount.publicKey;
const readXdr = (given) => (/^[A-Za-z0-9+/=]{60,}$/.test(given || '') ? given : readFileSync(given, 'utf8')).trim();

/** Rows describing the expected deploy transaction, checked against a decoded envelope. Pure (no network). */
export function checkDeployEnvelope(env, { account, contractId, expectedSequence }) {
  const rows = [];
  const add = (check, ok, detail = '') => rows.push({ check, ok: Boolean(ok), detail });
  const v1 = env && env.tx && env.tx.tx ? env.tx : null;
  add('decodes as a v1 transaction envelope', v1);
  if (!v1) return rows;
  const t = v1.tx;
  add('source account is the administrative account', t.source_account === account, t.source_account);
  add('sequence is the account sequence + 1', expectedSequence === undefined || String(t.seq_num) === String(expectedSequence), `${t.seq_num}, expected ${expectedSequence}`);
  add('no memo, no time bounds or preconditions', t.memo === 'none' && t.cond === 'none');
  const ops = t.operations || [];
  add('exactly one operation', ops.length === 1, `${ops.length}`);
  const op = ops[0] && ops[0].body && ops[0].body.invoke_host_function;
  const fn = op && op.host_function && op.host_function.create_contract_v2;
  add('it is create_contract_v2 with the operation source = transaction source', Boolean(fn) && ops[0].source_account === null);
  if (!fn) return rows;
  add('deployer address and fixed salt', fn.contract_id_preimage.address.address === account && fn.contract_id_preimage.address.salt === SALT, `salt ${fn.contract_id_preimage.address.salt}`);
  add('executable is the audited token Wasm', fn.executable.wasm === WASM_HASH, fn.executable.wasm);
  const a = fn.constructor_args || [];
  add('constructor: minter = the administrative account', a[0] && a[0].address === account, JSON.stringify(a[0]));
  add('constructor: cap, decimals, name, symbol = the existing token values', a.length === 5 && a[1].i128 === PARAMS.cap && a[2].u32 === PARAMS.decimals && a[3].string === PARAMS.name && a[4].string === PARAMS.symbol, JSON.stringify(a.slice(1)));
  add('exactly five constructor arguments', a.length === 5, `${a.length}`);
  const auth = op.auth || [];
  add('one authorization entry, source-account credentials, no sub-invocations', auth.length === 1 && auth[0].credentials === 'source_account' && auth[0].root_invocation.sub_invocations.length === 0, `${auth.length}`);
  const fp = v1.tx.ext && v1.tx.ext.v1 && v1.tx.ext.v1.resources && v1.tx.ext.v1.resources.footprint;
  const rw = (fp && fp.read_rw) || (fp && fp.read_write) || [];
  const ro = (fp && fp.read_only) || [];
  add('footprint writes only the new instance and reads only the Wasm code', rw.length === 1 && rw[0].contract_data && rw[0].contract_data.contract === contractId && ro.length === 1 && ro[0].contract_code && ro[0].contract_code.hash === WASM_HASH, `${JSON.stringify(rw).slice(0, 120)}`);
  return rows;
}

/** Rows for a mint transaction. Pure. */
export function checkMintEnvelope(env, { account, token, to, amount, expectedSequence }) {
  const rows = [];
  const add = (check, ok, detail = '') => rows.push({ check, ok: Boolean(ok), detail });
  const v1 = env && env.tx && env.tx.tx ? env.tx : null;
  add('decodes as a v1 transaction envelope', v1);
  if (!v1) return rows;
  const t = v1.tx;
  add('source account is the administrative account', t.source_account === account, t.source_account);
  add('sequence is the account sequence + 1', expectedSequence === undefined || String(t.seq_num) === String(expectedSequence), `${t.seq_num}, expected ${expectedSequence}`);
  add('no memo, no time bounds or preconditions', t.memo === 'none' && t.cond === 'none');
  const ops = t.operations || [];
  add('exactly one operation', ops.length === 1, `${ops.length}`);
  const op = ops[0] && ops[0].body && ops[0].body.invoke_host_function;
  const fn = op && op.host_function && op.host_function.invoke_contract;
  add('it invokes the new token, function mint, with the operation source = transaction source', Boolean(fn) && ops[0].source_account === null && fn.contract_address === token && fn.function_name === 'mint', fn ? `${fn.contract_address} ${fn.function_name}` : '');
  const a = (fn && fn.args) || [];
  add('arguments: to and amount exactly as approved', a.length === 2 && a[0].address === to && a[1].i128 === String(amount), JSON.stringify(a));
  const auth = (op && op.auth) || [];
  add('one authorization entry, source-account credentials, no sub-invocations', auth.length === 1 && auth[0].credentials === 'source_account' && auth[0].root_invocation.sub_invocations.length === 0, `${auth.length}`);
  return rows;
}

/** Rows for an ExtendFootprintTTL transaction that extends ONLY the instance entry of `contractId`. Pure. */
export function checkTtlEnvelope(env, { account, contractId, extendTo, expectedSequence }) {
  const rows = [];
  const add = (check, ok, detail = '') => rows.push({ check, ok: Boolean(ok), detail });
  const v1 = env && env.tx && env.tx.tx ? env.tx : null;
  add('decodes as a v1 transaction envelope', v1);
  if (!v1) return rows;
  const t = v1.tx;
  add('source account is the administrative account', t.source_account === account, t.source_account);
  add('sequence is the expected one', expectedSequence === undefined || String(t.seq_num) === String(expectedSequence), `${t.seq_num}, expected ${expectedSequence}`);
  add('no memo, no time bounds or preconditions', t.memo === 'none' && t.cond === 'none');
  const ops = t.operations || [];
  add('exactly one operation', ops.length === 1, `${ops.length}`);
  const op = ops[0] && ops[0].body && ops[0].body.extend_footprint_ttl;
  add('it is extend_footprint_ttl with extend_to = ' + extendTo + ' ledgers and the operation source = transaction source', Boolean(op) && ops[0].source_account === null && Number(op.extend_to) === extendTo, op ? `extend_to ${op.extend_to}` : '');
  const fp = t.ext && t.ext.v1 && t.ext.v1.resources && t.ext.v1.resources.footprint;
  const ro = (fp && fp.read_only) || [];
  const rw = (fp && (fp.read_write || fp.read_rw)) || [];
  add('footprint: only the new instance entry (read-only), nothing else, nothing written', rw.length === 0 && ro.length === 1 && Boolean(ro[0].contract_data) && ro[0].contract_data.contract === contractId && ro[0].contract_data.key === 'ledger_key_contract_instance', JSON.stringify(ro).slice(0, 160));
  return rows;
}

/** Which of the named signers have a valid signature on the envelope, and their combined weight (weights from the on-chain account). */
export function signerReport(env, hash, onChain, manifest, names) {
  const sigs = (env.tx && env.tx.signatures) || [];
  const roles = Object.fromEntries(manifest.signers.map((s) => [s.role, s.publicKey]));
  const weights = Object.fromEntries(onChain.signers.map((s) => [s.key, s.weight]));
  const valid = Object.entries({ ...roles, master: manifest.bootstrapAccount.publicKey }).filter(([, k]) => sigs.some((s) => verifySignature(hash, s.signature, k)));
  const weight = valid.reduce((n, [, k]) => n + (weights[k] || 0), 0);
  const rows = [];
  const got = valid.map(([r]) => r).sort().join(',');
  const want = [...names].sort().join(',');
  rows.push({ check: `signatures present and valid from exactly: ${want || '(none)'}`, ok: got === want && sigs.length === names.length, detail: `valid: ${got || 'none'}; ${sigs.length} signature(s) in the envelope` });
  return { rows, weight, got };
}

function printRows(rows) {
  for (const r of rows) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.check}${r.detail ? ': ' + r.detail : ''}`);
  return rows.every((r) => r.ok);
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const m = readJson(MANIFEST);
  const account = admin();
  const contractId = predictContractId(account);
  const acct = await lookup(account);
  if (acct.state !== 'exists') throw new Error('the administrative account does not exist on Testnet');
  const nextSeq = BigInt(acct.account.sequence) + BigInt(arg('--seq-plus', rest) || 1);
  if (cmd === 'build-deploy') {
    if (await instanceExists(contractId)) throw new Error(`the instance ${contractId} already exists on-chain: refusing to build another deployment`);
    const wasm = arg('--wasm', rest) || process.env.TOBIN_TOKEN_WASM || 'C:/Users/Ebubechi/AppData/Local/Temp/tobin-target/wasm32v1-none/release/tobin_test_token.wasm';
    const local = createHash('sha256').update(readFileSync(wasm)).digest('hex');
    if (local !== WASM_HASH) throw new Error(`the local Wasm hash ${local} is not the audited token Wasm ${WASM_HASH}`);
    // The CLI only accepts constructor arguments together with --wasm; it skips the upload because this exact Wasm is already installed.
    const unsimulated = run(['contract', 'deploy', '--wasm', wasm, '--source-account', account, '--salt', SALT, '--build-only', ...net, '--', '--minter', account, '--cap', PARAMS.cap, '--decimals', String(PARAMS.decimals), '--name', PARAMS.name, '--symbol', PARAMS.symbol]);
    const xdr = run(['tx', 'simulate', '--source-account', account, ...net], unsimulated.split('\n').pop());
    const env = decodeEnvelope(xdr);
    const ok = printRows(checkDeployEnvelope(env, { account, contractId, expectedSequence: nextSeq }));
    if (!ok) throw new Error('the built transaction does not match the approved deployment');
    const t = env.tx.tx;
    console.log(`\nNetwork: ${PASSPHRASE}\nSource: ${account}\nSequence: ${t.seq_num}\nFee: ${t.fee} stroops (inclusion 100 + resource ${t.ext.v1.resource_fee})\nPredicted contract ID: ${contractId}\nRequired authorization: medium threshold 6 = Founder (5) + Security (1)\nHash: ${envelopeHash(xdr)}\n\nUnsigned XDR:\n${xdr}`);
    if (arg('--out', rest)) writeFileSync(arg('--out', rest), xdr + '\n');
  } else if (cmd === 'verify-deploy') {
    const xdr = readXdr(rest.find((x) => !x.startsWith('--') && x !== arg('--signers', rest)));
    const env = decodeEnvelope(xdr);
    const names = (arg('--signers', rest) || 'founder,security').split(',');
    const rows = checkDeployEnvelope(env, { account, contractId, expectedSequence: nextSeq });
    const sr = signerReport(env, envelopeHash(xdr), acct.account, m, names);
    rows.push(...sr.rows, { check: 'combined weight meets the medium threshold (6)', ok: sr.weight >= 6, detail: `${sr.weight}` });
    const ok = printRows(rows);
    console.log(ok ? `VALID: hash ${envelopeHash(xdr)}` : 'NOT VALID: do not submit');
    process.exitCode = ok ? 0 : 1;
  } else if (cmd === 'build-mint') {
    const token = arg('--token', rest), to = arg('--to', rest), amount = arg('--amount', rest);
    if (!token || !to || !amount) throw new Error('--token, --to and --amount are required');
    const unsimulated = run(['contract', 'invoke', '--id', token, '--source-account', account, '--build-only', ...net, '--', 'mint', '--to', to, '--amount', amount]);
    // The CLI always builds at sequence + 1. For a later slot (--seq-plus N), set the sequence number on the unsigned, unsimulated transaction only.
    let built = unsimulated.split('\n').pop();
    if (nextSeq !== BigInt(acct.account.sequence) + 1n) {
      const e0 = decodeEnvelope(built);
      e0.tx.tx.seq_num = String(nextSeq);
      built = run(['xdr', 'encode', '--type', 'TransactionEnvelope', '--input', 'json', '--output', 'single-base64'], JSON.stringify(e0));
    }
    const xdr = run(['tx', 'simulate', '--source-account', account, ...net], built);
    const env = decodeEnvelope(xdr);
    const ok = printRows(checkMintEnvelope(env, { account, token, to, amount, expectedSequence: nextSeq }));
    if (!ok) throw new Error('the built transaction does not match the approved mint');
    console.log(`\nSource: ${account}\nSequence: ${env.tx.tx.seq_num}\nFee: ${env.tx.tx.fee}\nHash: ${envelopeHash(xdr)}\n\nUnsigned XDR:\n${xdr}`);
    if (arg('--out', rest)) writeFileSync(arg('--out', rest), xdr + '\n');
  } else if (cmd === 'verify-mint') {
    const xdr = readXdr(rest.find((x) => !x.startsWith('--') && ![arg('--token', rest), arg('--to', rest), arg('--amount', rest), arg('--signers', rest)].includes(x)));
    const env = decodeEnvelope(xdr);
    const names = (arg('--signers', rest) || '').split(',').filter(Boolean);
    const rows = checkMintEnvelope(env, { account, token: arg('--token', rest), to: arg('--to', rest), amount: arg('--amount', rest), expectedSequence: nextSeq });
    const sr = signerReport(env, envelopeHash(xdr), acct.account, m, names);
    rows.push(...sr.rows);
    const ok = printRows(rows);
    console.log(`${ok ? 'VALID' : 'NOT VALID'}: hash ${envelopeHash(xdr)}; combined weight of valid signatures ${sr.weight} (medium threshold is 6)`);
    process.exitCode = ok ? 0 : 1;
  } else if (cmd === 'build-ttl') {
    const ledgers = Number(arg('--ledgers', rest));
    if (!ledgers) throw new Error('--ledgers is required');
    const token = arg('--token', rest);
    const unsimulated = run(['contract', 'extend', '--id', token, '--durability', 'persistent', '--ledgers-to-extend', String(ledgers), '--source-account', account, '--build-only', ...net]);
    const xdr = run(['tx', 'simulate', '--source-account', account, ...net], unsimulated.split('\n').pop());
    const env = decodeEnvelope(xdr);
    const ok = printRows(checkTtlEnvelope(env, { account, contractId: token, extendTo: ledgers, expectedSequence: nextSeq }));
    if (!ok) throw new Error('the built transaction does not match the approved TTL extension');
    const t = env.tx.tx;
    console.log(`\nSource: ${account}\nSequence: ${t.seq_num}\nFee: ${t.fee} stroops (resource fee ${t.ext.v1.resource_fee})\nResources: ${JSON.stringify({ ...t.ext.v1.resources, footprint: undefined })}\nHash: ${envelopeHash(xdr)}\n\nUnsigned XDR:\n${xdr}`);
    if (arg('--out', rest)) writeFileSync(arg('--out', rest), xdr + '\n');
  } else if (cmd === 'verify-ttl') {
    const xdr = readXdr(rest.find((x) => !x.startsWith('--') && ![arg('--token', rest), arg('--ledgers', rest), arg('--signers', rest), arg('--seq-plus', rest)].includes(x)));
    const env = decodeEnvelope(xdr);
    const names = (arg('--signers', rest) || '').split(',').filter(Boolean);
    const rows = checkTtlEnvelope(env, { account, contractId: arg('--token', rest), extendTo: Number(arg('--ledgers', rest)), expectedSequence: nextSeq });
    const sr = signerReport(env, envelopeHash(xdr), acct.account, m, names);
    rows.push(...sr.rows);
    const ok = printRows(rows);
    console.log(`${ok ? 'VALID' : 'NOT VALID'}: hash ${envelopeHash(xdr)}; combined weight of valid signatures ${sr.weight} (medium threshold is 6)`);
    process.exitCode = ok ? 0 : 1;
  } else if (cmd === 'submit') {
    const xdr = readXdr(rest[0]);
    try {
      console.log(run(['tx', 'send', ...net], xdr).slice(-1500));
    } catch (e) {
      console.log('SUBMISSION REJECTED OR FAILED:\n' + String(e.stderr || e.message).slice(0, 1500));
      process.exitCode = 1;
    }
  } else {
    console.error('usage: governed-token.mjs build-deploy | verify-deploy | build-mint | verify-mint | submit');
    process.exitCode = 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
