// Stage 4 helper: the OWNER-RUN transaction-level co-signing test for the administrative multisig account. Server side. It builds a HARMLESS transaction that can never
// execute (its sequence number is deliberately far ahead, so the network would reject it as tx_bad_seq even if someone submitted it) and that exercises the same
// account-level requirement as a contract call: the MEDIUM threshold. The owner signs it with the required signers in their own Freighter; the server then verifies the
// real signatures against the LIVE signer set. Nothing is ever submitted by this module and no key is held here.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Account, Operation, TransactionBuilder } from '@stellar/stellar-sdk';
import { fetchLiveSignerSet } from './live.ts';
import { createServer, TESTNET } from './rpc.ts';
import { fingerprintOf, minimalAuthorizingSets, verifyEnvelope } from './signer-set.ts';
import type { EnvelopeVerification, SignerSet } from './signer-set.ts';

export interface CosignPolicy { account: string; required: { role: string; key: string }[] }
export function readPolicy(): CosignPolicy {
  const path = process.env['TOBIN_ADMIN_ACCOUNT_RECORD'] ?? resolve(process.cwd(), '../../accounts/testnet-admin.json');
  const a = JSON.parse(readFileSync(path, 'utf8')) as { accountId: string; signers: { role: string; publicKey: string }[] };
  const req = ['founder', 'security'].map((role) => ({ role, key: (a.signers.find((s) => s.role === role) ?? { publicKey: '' }).publicKey }));
  if (req.some((r) => !r.key)) throw new Error('the administrative account record has no Founder or Security signer');
  return { account: a.accountId, required: req };
}

const PREPARED = new Map<string, { fingerprint: string; account: string; expires: number }>();
const SEQUENCE_JUMP = 1000n;

export interface CosignPrepared { account: string; network: 'testnet'; passphrase: string; xdr: string; hash: string; fingerprint: string; thresholds: SignerSet['thresholds']; signers: SignerSet['signers']; required: CosignPolicy['required']; minimalSets: string[][]; note: string }
export async function prepareCosign(policy: CosignPolicy = readPolicy()): Promise<{ ok: true; prepared: CosignPrepared } | { ok: false; reason: string }> {
  const live = await fetchLiveSignerSet(policy.account);
  if (!live.ok) return { ok: false, reason: live.reason };
  for (const r of policy.required) if (!live.set.signers.some((s) => s.key === r.key)) return { ok: false, reason: `the required ${r.role} key is not a signer of the account on chain: the repository assumption is wrong; stop` };
  const acct = await createServer().getAccount(policy.account);
  const seq = (BigInt(acct.sequenceNumber()) + SEQUENCE_JUMP).toString();
  // TransactionBuilder increments the sequence of the Account it is given by one: pass seq-1 so the built transaction carries `seq`
  const tx = new TransactionBuilder(new Account(policy.account, (BigInt(seq) - 1n).toString()), { fee: '100', networkPassphrase: TESTNET.passphrase })
    .addOperation(Operation.manageData({ name: 'tobin-cosign-test', value: 'never-submitted' })).setTimeout(900).build();
  const hash = Buffer.from(tx.hash()).toString('hex');
  PREPARED.set(hash, { fingerprint: live.fingerprint, account: policy.account, expires: Date.now() + 20 * 60 * 1000 });
  return { ok: true, prepared: { account: policy.account, network: 'testnet', passphrase: TESTNET.passphrase, xdr: tx.toXDR(), hash, fingerprint: live.fingerprint, thresholds: live.set.thresholds, signers: live.set.signers, required: policy.required, minimalSets: minimalAuthorizingSets(live.set, live.set.thresholds.medium), note: 'A harmless transaction that CANNOT execute (its sequence number is far ahead, so the network would reject it). Sign it only; it must not be submitted.' } };
}

export interface CosignVerified extends EnvelopeVerification { unchangedSincePrepared: boolean; freshSignerSet: boolean; policySatisfied: boolean; required: CosignPolicy['required'] }
export async function verifyCosign(xdr: string, policy: CosignPolicy = readPolicy()): Promise<{ ok: true; result: CosignVerified } | { ok: false; reason: string }> {
  let hash = ''; try { hash = Buffer.from(TransactionBuilder.fromXDR(xdr, TESTNET.passphrase).hash()).toString('hex'); } catch { return { ok: false, reason: 'the transaction cannot be read' }; }
  const prep = PREPARED.get(hash);
  if (!prep || prep.expires < Date.now() || prep.account !== policy.account) return { ok: false, reason: 'this transaction was not prepared here, or it expired: the signed transaction must be exactly the one that was prepared' };
  const live = await fetchLiveSignerSet(policy.account);
  if (!live.ok) return { ok: false, reason: live.reason }; // fail closed
  const v = verifyEnvelope({ set: live.set, expectedFingerprint: prep.fingerprint, passphrase: TESTNET.passphrase, xdr, level: 'medium', require: policy.required.map((r) => r.key) });
  return { ok: true, result: { ...v, unchangedSincePrepared: v.transactionHash === hash, freshSignerSet: live.fingerprint === prep.fingerprint, policySatisfied: policy.required.every((r) => v.signers.some((s) => s.key === r.key)), required: policy.required } };
}
void fingerprintOf;
