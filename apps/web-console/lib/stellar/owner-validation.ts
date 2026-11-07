// Server side of the OWNER-RUN Freighter validation (MVP-1.5). Builds, from REAL read-only Testnet data, the harmless unsigned material the owner's installed Freighter is
// asked to sign in Microsoft Edge: (1) a simulated, UNSUBMITTED create_session transaction sourced from the connected account; (2) the real network-returned
// AddressV2 authorization entry of a simulated join into the recorded Open session. Nothing is ever submitted, and no key is held, sent or stored here.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Account, Contract, TransactionBuilder, rpc } from '@stellar/stellar-sdk';
import { prepareCreateSession, prepareJoin } from 'tobin-mvp1-sdk/sdk';
import { buildAndSimulate, createServer, toScVal, TESTNET } from './rpc.ts';
import { isStellarAccount } from '../registry/wallet-proof.ts';
import { createHash, randomBytes } from 'node:crypto';

export interface Deployment { rpc: string; clearing: string; token: string; recordedSessionId: string; recordedCreator: string }
export function readDeployment(): Deployment {
  const path = process.env['TOBIN_DEPLOYMENT_RECORD'] ?? resolve(process.cwd(), '../../contracts/deployments/testnet.json');
  const d = JSON.parse(readFileSync(path, 'utf8')) as { networkPassphrase: string; rpc: string; contracts: Record<string, { contractId: string }>; functionalChecks?: { sessionId: string } };
  if (d.networkPassphrase !== TESTNET.passphrase) throw new Error('the deployment record is not Testnet');
  return { rpc: d.rpc, clearing: d.contracts['tobin_clearing_v1']!.contractId, token: d.contracts['tobin_test_token_governed']!.contractId, recordedSessionId: d.functionalChecks?.sessionId ?? '', recordedCreator: process.env['TOBIN_VALIDATION_CREATOR'] ?? 'GB4WIKKCYDDQUKLTKBMMMCPLZJVXZWL36CJEGWXMKEYV7NNLS2MDE7G5' };
}

export interface OwnerValidationMaterial {
  network: 'testnet'; passphrase: string; account: string; accountExists: boolean; latestLedger: number;
  testTransaction: null | { xdr: string; fee: string; sessionId: string; minResourceFee?: string; credentialTypes: string[]; note: string };
  authEntry: null | { entryXdr: string; address: string; validUntilLedgerSeq: number; credentialTypes: string[]; note: string };
  problems: string[];
}

export async function prepareOwnerValidation(account: string, dep: Deployment = readDeployment()): Promise<OwnerValidationMaterial> {
  if (!isStellarAccount(account)) throw new Error('not a valid Stellar account address');
  const server = createServer(dep.rpc);
  const latest = await server.getLatestLedger();
  const out: OwnerValidationMaterial = { network: 'testnet', passphrase: TESTNET.passphrase, account, accountExists: false, latestLedger: latest.sequence, testTransaction: null, authEntry: null, problems: [] };
  try { await server.getAccount(account); out.accountExists = true; } catch { out.problems.push('the connected account does not exist on Stellar Testnet (it must be funded first); transaction material cannot be built from it'); }

  if (out.accountExists) {
    // (1) an UNSUBMITTED create_session sourced from the connected account: the account is both source and signer, so the network returns a source-account credential
    const sessionId = createHash('sha256').update(randomBytes(16)).digest('hex');
    const call = prepareCreateSession(dep.clearing, { creator: account, sessionId, token: dep.token, maxParticipants: 2, maxObligations: 1 });
    const b = await buildAndSimulate(server, call, account);
    if (b.simulation.ok) out.testTransaction = { xdr: b.xdr, fee: b.fee, sessionId, ...(b.simulation.minResourceFee ? { minResourceFee: b.simulation.minResourceFee } : {}), credentialTypes: b.simulation.authEntries.map((a) => a.credentials), note: 'An unsigned, simulated create_session for a random session id. It is for the signing test only and must NOT be submitted.' };
    else out.problems.push('simulation of the test transaction failed: ' + String(b.simulation.error).slice(0, 200));
  }

  // (2) the AddressV2 entry of the connected account as a joining participant into the recorded Open session; the SESSION CREATOR is the transaction source so the
  //     connected account is NOT the source and the network must hand it an address credential (AddressV2 under protocol 30)
  if (dep.recordedSessionId && dep.recordedCreator !== account) {
    try {
      const call = prepareJoin(dep.clearing, { sessionId: dep.recordedSessionId, participant: account, creator: dep.recordedCreator });
      const src = await server.getAccount(dep.recordedCreator);
      const tx = new TransactionBuilder(new Account(dep.recordedCreator, src.sequenceNumber()), { fee: '100', networkPassphrase: TESTNET.passphrase }).addOperation(new Contract(call.contract).call(call.fn, ...call.args.map(toScVal))).setTimeout(60).build();
      const sim = await server.simulateTransaction(tx);
      if (rpc.Api.isSimulationError(sim)) out.problems.push('simulation of the join failed: ' + String(sim.error).slice(0, 200));
      else {
        const entries = (sim.result?.auth ?? []) as { toXDR: (f: 'base64') => string; credentials: unknown }[];
        const mine = entries.find((e) => { const c = JSON.parse(JSON.stringify(e.credentials)) as unknown; return typeof c === 'object' && c !== null && JSON.stringify(c).includes(account); });
        if (!mine) out.problems.push('the network returned no address credential for the connected account');
        else out.authEntry = { entryXdr: mine.toXDR('base64'), address: account, validUntilLedgerSeq: latest.sequence + 10, credentialTypes: entries.map((e) => { const c = JSON.parse(JSON.stringify(e.credentials)) as unknown; return typeof c === 'string' ? c : Object.keys((c ?? {}) as object)[0] ?? 'unknown'; }), note: 'A real authorization entry returned by Testnet simulation for a join into the recorded Open session. It is for the signing test only and must NOT be submitted.' };
      }
    } catch (e) { out.problems.push('could not prepare the authorization entry: ' + String((e as Error).message ?? e).slice(0, 200)); }
  } else if (!dep.recordedSessionId) out.problems.push('no recorded session is available for the authorization-entry test');
  return out;
}
