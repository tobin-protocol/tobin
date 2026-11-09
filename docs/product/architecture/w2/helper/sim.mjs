// Read-only: build the transaction through the SDK prepare/intent layers, simulate on Testnet (no signature, no submission), run the entry check.
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const S = require('@stellar/stellar-sdk');
const C = require('./public/core.js');
const base = 'http://127.0.0.1:8799';
const cfg = await (await fetch(base + '/api/config')).json();
const op = process.argv[2] || 'create';
const p = await (await fetch(base + '/api/prepare', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op }) })).json();
const server = new S.rpc.Server(base + '/api/rpc', { allowHttp: true });
const acct = await server.getAccount(cfg.accounts.E);
const tx = new S.TransactionBuilder(acct, { fee: '1000', networkPassphrase: cfg.passphrase, timebounds: { minTime: 0, maxTime: Math.floor(Date.now() / 1000) + 300 } })
  .addOperation(S.Operation.invokeContractFunction({ contract: p.call.contract, function: p.call.fn, args: p.call.args.map((a) => C.scVal(S, a)) })).build();
const latest = await server.getLatestLedger();
const sim = await server.simulateTransaction(tx);
const out = { op, latestLedger: latest.sequence, protocolVersion: latest.protocolVersion, sourceSequence: acct.sequenceNumber(), isError: S.rpc.Api.isSimulationError(sim) };
if (out.isError) out.error = sim.error;
else {
  out.minResourceFee = sim.minResourceFee;
  out.cost = sim.cost;
  out.auth = sim.result.auth.map((a) => { const ac = C.addrCreds(a.credentials); return { credentialType: a.credentials.type, signer: S.Address.fromScAddress(ac.address).toString(), expiration: ac.signatureExpirationLedger, fn: a.rootInvocation.function.contractFn.functionName.toString(), subs: a.rootInvocation.subInvocations.length }; });
  out.entryProblems = C.checkEntries(S, sim.result.auth, p.intent, cfg.passphrase);
  const asm = S.rpc.assembleTransaction(tx, sim).build();
  out.assembledFeeStroops = asm.fee;
  out.assembledOpAuthCount = asm.operations[0].auth.length;
  const d = sim.transactionData;
  out.sorobanData = (() => { try { const r = d.build ? d.build() : d; return JSON.parse(JSON.stringify(r, (k, v) => typeof v === 'bigint' ? v.toString() : v instanceof Uint8Array ? undefined : v)); } catch (e) { return String(e.message); } })();
  out.events = sim.events ? sim.events.length : 0;
  // mutation round trip: does editing op.auth reach the XDR?
  const x0 = asm.toXDR(); asm.operations[0].auth = asm.operations[0].auth.slice(0, 0); out.authMutationReachesXdr = asm.toXDR() !== x0;
}
console.log(JSON.stringify(out, null, 1));
fs.writeFileSync(`evidence/sim-${op}.json`, JSON.stringify(out, null, 1));
