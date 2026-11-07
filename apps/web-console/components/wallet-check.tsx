'use client';
// OWNER-RUN Freighter validation page (MVP-1.5). Run it in Microsoft Edge with the installed Freighter extension on Stellar Testnet. It checks what is REAL:
// detection, connection, network, account, signing of a harmless UNSUBMITTED transaction, and signing of a real network-returned AddressV2 authorization entry.
// NOTHING is submitted, no key leaves the wallet, and no signed envelope or signature is stored or logged here (only PASS/FAIL and non-secret facts are shown).
// A result is PASS only if the real extension answered correctly and the answer was VERIFIED here. No fake wallet is ever used.
import { useState } from 'react';
import Link from 'next/link';
import { Buffer } from 'buffer';
import { authorizeEntry, xdr } from '@stellar/stellar-sdk';
import { api } from './api-client.ts';
import { browserName, connectWallet, inspectWallet, requestTransactionSignature } from '../lib/stellar/freighter.ts';
import type { FreighterLike } from '../lib/stellar/freighter.ts';

const PASSPHRASE = 'Test SDF Network ; September 2015';
type Status = 'PASS' | 'FAIL' | 'NOT RUN';
interface Row { id: string; label: string; status: Status; detail: string }
const STEPS: [string, string][] = [
  ['detect', 'Browser is Microsoft Edge and Freighter answers'], ['connect', 'Connect: the wallet grants access and reports a public key'], ['network', 'The wallet is on Stellar Testnet'], ['account', 'The account exists on Testnet (read-only network check)'],
  ['sign-tx', 'Sign a harmless UNSUBMITTED transaction: the same transaction comes back, validly signed by the connected key'], ['sign-entry', 'Sign a real AddressV2 authorization entry through the official SDK: the signature verifies'],
];
const blank = (): Row[] => STEPS.map(([id, label]) => ({ id, label, status: 'NOT RUN' as Status, detail: '' }));

async function loadApi(): Promise<FreighterLike | undefined> {
  try { const m = (await import('@stellar/freighter-api')) as unknown as { default?: FreighterLike } & FreighterLike; return (m.default ?? m) as FreighterLike; } catch { return undefined; }
}

export function WalletCheck() {
  const [rows, setRows] = useState<Row[]>(blank());
  const [busy, setBusy] = useState(false);
  const [account, setAccount] = useState('');
  const [ranAt, setRanAt] = useState<string | null>(null); // set only after a run: a render-time clock would differ between server and browser (hydration)
  const [browser, setBrowser] = useState<string | null>(null);
  const set = (id: string, status: Status, detail: string) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, status, detail } : r)));

  const run = async () => {
    setBusy(true); setRows(blank()); setAccount(''); setRanAt(new Date().toISOString()); setBrowser(browserName(navigator.userAgent));
    try {
      const fr = await loadApi();
      const b = browserName(navigator.userAgent);
      const st0 = await inspectWallet(fr, { passphrase: PASSPHRASE });
      set('detect', b === 'Edge' && st0.kind !== 'UNAVAILABLE' ? 'PASS' : 'FAIL', `browser ${b}; wallet state ${st0.kind}${'reason' in st0 ? ': ' + st0.reason : ''}`);
      if (st0.kind === 'UNAVAILABLE') return;
      const c = await connectWallet(fr);
      if (!c.ok) { set('connect', 'FAIL', (c.rejected ? 'access refused: ' : 'error: ') + c.reason); return; }
      set('connect', 'PASS', 'access granted; public key ' + c.address.slice(0, 8) + '…' + c.address.slice(-6)); setAccount(c.address);
      const st = await inspectWallet(fr, { passphrase: PASSPHRASE, address: c.address });
      if (st.kind !== 'READY') { set('network', 'FAIL', st.kind === 'WRONG_NETWORK' ? `wallet is on ${st.network}, expected Stellar Testnet: switch Freighter to Testnet and run again` : st.kind); return; }
      set('network', 'PASS', `${st.network}, passphrase confirmed by the wallet`);
      const mat = await api<{ material: { accountExists: boolean; problems: string[]; testTransaction: null | { xdr: string; credentialTypes: string[]; minResourceFee?: string }; authEntry: null | { entryXdr: string; validUntilLedgerSeq: number; credentialTypes: string[] } } }>('POST', '/api/stellar/validation', { account: c.address }).then((r) => r.material);
      set('account', mat.accountExists ? 'PASS' : 'FAIL', mat.accountExists ? 'the account exists on Testnet' : mat.problems.join('; '));
      if (mat.testTransaction) {
        const s = await requestTransactionSignature(fr, mat.testTransaction.xdr, { passphrase: PASSPHRASE, address: c.address });
        set('sign-tx', s.ok ? 'PASS' : 'FAIL', s.ok ? `signed and verified (the returned transaction is identical; credential types in the simulation: ${mat.testTransaction.credentialTypes.join(', ')}; resource fee ${mat.testTransaction.minResourceFee ?? 'n/a'} stroops). It was NOT submitted and is discarded.` : `${s.kind}: ${s.reason}`);
      } else set('sign-tx', 'FAIL', mat.problems.join('; ') || 'no test transaction could be prepared');
      if (mat.authEntry) {
        let shape = '';
        try {
          const entry = xdr.SorobanAuthorizationEntry.fromXDR(mat.authEntry.entryXdr, 'base64');
          // official SDK path: authorizeEntry builds the CAP-71 preimage for AddressV2 and verifies the signature; the wallet only signs the bytes it is given
          await authorizeEntry(entry, (async (preimage: { toXDR: (f: 'base64') => string }) => {
            const r = await (fr as FreighterLike).signAuthEntry(preimage.toXDR('base64'), { networkPassphrase: PASSPHRASE, address: c.address });
            if (r.error || !r.signedAuthEntry) throw new Error(r.error?.message ?? 'the wallet returned no signature');
            shape = `wallet returned ${r.signedAuthEntry.length} base64 characters`;
            return { signature: Buffer.from(r.signedAuthEntry, 'base64'), publicKey: r.signerAddress };
          }) as never, mat.authEntry.validUntilLedgerSeq, PASSPHRASE);
          set('sign-entry', 'PASS', `an authorization entry of credential type ${mat.authEntry.credentialTypes.join(', ')} was signed through Freighter and the SDK accepted the signature (${shape}). It was NOT submitted and is discarded.`);
        } catch (e) { set('sign-entry', 'FAIL', `${String((e as Error).message ?? e).slice(0, 220)}${shape ? ' (' + shape + ')' : ''}`); }
      } else set('sign-entry', 'FAIL', mat.problems.join('; ') || 'no authorization entry could be prepared');
    } catch (e) { setRows((rs) => rs.map((r) => (r.status === 'NOT RUN' && r.detail === '' ? { ...r, detail: 'stopped: ' + String((e as Error).message ?? e).slice(0, 160) } : r))); }
    finally { setBusy(false); }
  };

  const evidence = JSON.stringify({ at: ranAt, browser, account: account ? account.slice(0, 8) + '…' + account.slice(-6) : null, results: rows.map((r) => ({ id: r.id, status: r.status })) }, null, 2);
  return (
    <main className="ss">
      <p className="ss-banner" role="note">Owner-run wallet validation. Testnet only. Nothing is submitted, nothing is stored, and no key leaves Freighter. Run this in Microsoft Edge with the Freighter extension unlocked and set to Stellar Testnet. <Link href="/sessions">Back to sessions</Link></p>
      <h2>Freighter validation (Edge, Stellar Testnet)</h2>
      <p className="ss-note">The wallet is asked to sign harmless, unsubmitted test material. A step passes only if the real extension answered and the answer was verified here. Approve or reject the prompts as the procedure in the MVP-1.5 Freighter owner validation document says; a refusal is recorded as FAIL for that step, which is a valid test result.</p>
      <p className="ss-actions"><button type="button" onClick={() => void run()} disabled={busy}>{busy ? 'Running… (approve the Freighter prompts)' : 'Run validation'}</button></p>
      <table className="ss-list"><caption className="ss-sr">Wallet validation results</caption>
        <thead><tr>{['Check', 'Result', 'Detail'].map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
        <tbody>{rows.map((r) => <tr key={r.id}><td data-label="Check">{r.label}</td><td data-label="Result"><span className={`ss-badge ss-${r.status === 'PASS' ? 'ok' : r.status === 'FAIL' ? 'warn' : 'neutral'}`}>{r.status}</span></td><td data-label="Detail">{r.detail || '—'}</td></tr>)}</tbody></table>
      <h3>Evidence to paste back (no secrets)</h3>
      <pre className="ss-pre" aria-label="Evidence">{evidence}</pre>
    </main>
  );
}
