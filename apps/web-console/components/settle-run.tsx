'use client';
// OWNER-RUN one-unit settlement on Stellar Testnet (MVP-1.5 stage 5), Microsoft Edge + Freighter. One on-chain step at a time. For each step: the server re-reads the chain and
// simulates the step; you sign what Freighter asks (an authorization entry where one is needed, then the transaction with the required signer or signers); you type the exact
// confirmation for that step; only then is the signed transaction submitted. Nothing is resent automatically, and an unknown outcome is never treated as failure or success.
// No key leaves Freighter and no signature is stored or shown here.
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { authorizeEntry, xdr } from '@stellar/stellar-sdk';
import { Buffer } from 'buffer';
import { api } from './api-client.ts';
import { browserName, inspectWallet, requestTransactionSignature } from '../lib/stellar/freighter.ts';
import type { FreighterLike } from '../lib/stellar/freighter.ts';

interface Gate { id: string; ok: boolean; detail: string }
interface Status { config: { clearing: string; token: string; admin: string; second: string; batchId: string }; planFingerprint: string; sessionId: string; expectedDigest: string; progress: string; mismatches: string[]; steps: { index: number; fn: string; signers: string[]; done: boolean; attempt: { hash: string; outcome: string } | null }[]; next: number | null; gates: Gate[]; balances: { admin: string | null; second: string | null; totalSupply: string | null } }
interface Prepared { step: number; fn: string; hash: string; xdr: string; source: string; fee: string; minResourceFee: string | null; latestLedger: number | null; entryValidUntil: number | null; pendingEntries: { index: number; address: string; entryXdr: string }[]; envelopeSigners: { role: string; key: string }[]; passphrase: string; note: string }
interface Result { outcome: string; hash: string; detail: string; ledger?: number; progress: string }
async function loadApi(): Promise<FreighterLike | undefined> {
  try { const m = (await import('@stellar/freighter-api')) as unknown as { default?: FreighterLike } & FreighterLike; return (m.default ?? m) as FreighterLike; } catch { return undefined; }
}
const short = (k: string) => `${k.slice(0, 6)}…${k.slice(-6)}`;

export function SettleRun() {
  const [st, setSt] = useState<Status | null>(null);
  const [p, setP] = useState<Prepared | null>(null);
  const [xdrNow, setXdrNow] = useState(''); const [hash, setHash] = useState('');
  const [entriesDone, setEntriesDone] = useState<number[]>([]); const [signed, setSigned] = useState<string[]>([]);
  const [confirm, setConfirm] = useState('');
  const [log, setLog] = useState<{ ok: boolean; text: string }[]>([]);
  const [results, setResults] = useState<{ step: number; result: Result }[]>([]);
  const [busy, setBusy] = useState(false);
  const [ranAt, setRanAt] = useState<string | null>(null); const [browser, setBrowser] = useState<string | null>(null);
  const note = (ok: boolean, text: string) => setLog((l) => [...l, { ok, text }]);

  const refresh = useCallback(async () => {
    try { const r = await api<{ status: Status }>('POST', '/api/stellar/run', { action: 'status' }); setSt(r.status); return r.status; }
    catch (e) { setSt(null); note(false, 'Could not read the chain: ' + (e as Error).message); return null; }
  }, []);
  useEffect(() => { setRanAt(new Date().toISOString()); setBrowser(browserName(navigator.userAgent)); void refresh(); }, [refresh]);

  const wallet = async (address: string): Promise<FreighterLike | null> => {
    const fr = await loadApi();
    const ra = (fr as unknown as { requestAccess?: () => Promise<{ error?: { message?: string } }> } | undefined)?.requestAccess;
    if (ra) { const g = await ra(); if (g.error) { note(false, 'Freighter refused access: ' + (g.error.message ?? 'rejected')); return null; } }
    const s = await inspectWallet(fr, { passphrase: 'Test SDF Network ; September 2015', address });
    if (s.kind === 'ACCOUNT_MISMATCH') { note(false, `Freighter is on ${short(s.address)}. Switch Freighter to ${short(address)} and press the button again.`); return null; }
    if (s.kind !== 'READY') { note(false, `Freighter is not ready (${s.kind}${'reason' in s ? ': ' + s.reason : ''}).`); return null; }
    return fr ?? null;
  };

  const prepare = async (step: number) => {
    setBusy(true); setP(null); setConfirm(''); setEntriesDone([]); setSigned([]);
    try { const r = await api<{ prepared: Prepared }>('POST', '/api/stellar/run', { action: 'prepare', step }); setP(r.prepared); setXdrNow(r.prepared.xdr); setHash(r.prepared.hash); note(true, `Step ${step} (${r.prepared.fn}) prepared and simulated against the real chain state.`); }
    catch (e) { note(false, `Step ${step} was refused: ` + (e as Error).message); } finally { setBusy(false); }
  };
  const signEntry = async (pe: Prepared['pendingEntries'][number]) => {
    if (!p || p.entryValidUntil === null) return; setBusy(true);
    try {
      const fr = await wallet(pe.address); if (!fr) return;
      const entry = xdr.SorobanAuthorizationEntry.fromXDR(pe.entryXdr, 'base64');
      const signedEntry = await authorizeEntry(entry, (async (preimage: { toXDR: (f: 'base64') => string }) => {
        const r = await fr.signAuthEntry(preimage.toXDR('base64'), { networkPassphrase: p.passphrase, address: pe.address });
        if (r.error || !r.signedAuthEntry) throw new Error(r.error?.message ?? 'the wallet returned no signature');
        return { signature: Buffer.from(r.signedAuthEntry, 'base64'), publicKey: r.signerAddress };
      }) as never, p.entryValidUntil, p.passphrase);
      const a = await api<{ xdr: string; hash: string }>('POST', '/api/stellar/run', { action: 'attach', hash, index: pe.index, entryXdr: signedEntry.toXDR('base64') });
      setXdrNow(a.xdr); setHash(a.hash); setEntriesDone((d) => [...d, pe.index]); note(true, `${short(pe.address)} signed its authorization entry; the network accepted it in simulation. Sign the transaction now, without delay: the entry is valid only until ledger ${p.entryValidUntil}.`);
    } catch (e) { note(false, 'Entry signing failed: ' + String((e as Error).message ?? e).slice(0, 240)); } finally { setBusy(false); }
  };
  const signEnvelope = async (r: { role: string; key: string }) => {
    if (!p) return; setBusy(true);
    try {
      const fr = await wallet(r.key); if (!fr) return;
      const s = await requestTransactionSignature(fr, xdrNow, { passphrase: p.passphrase, address: r.key });
      if (!s.ok) { note(false, `${r.role}: ${s.kind}: ${s.reason}`); return; }
      setXdrNow(s.signedXdr); setSigned((x) => [...x, r.key]); note(true, `${r.role} signed the transaction (verified: same transaction, valid signature by ${short(r.key)}).`);
    } finally { setBusy(false); }
  };
  const submit = async () => {
    if (!p) return; setBusy(true);
    try {
      const r = await api<{ result: Result }>('POST', '/api/stellar/run', { action: 'submit', step: p.step, xdr: xdrNow, confirmation: confirm });
      setResults((x) => [...x, { step: p.step, result: r.result }]); note(r.result.outcome === 'SUCCESS', `Step ${p.step}: ${r.result.outcome}: ${r.result.detail}`);
      setP(null); setConfirm(''); await refresh();
    } catch (e) { note(false, 'Submission refused: ' + (e as Error).message); } finally { setBusy(false); }
  };
  const resolve = async (step: number) => {
    setBusy(true);
    try { const r = await api<{ result: Result }>('POST', '/api/stellar/run', { action: 'resolve', step }); note(r.result.outcome === 'SUCCESS', `Step ${step} (original hash read): ${r.result.outcome}: ${r.result.detail}`); await refresh(); }
    catch (e) { note(false, (e as Error).message); } finally { setBusy(false); }
  };

  const needEntries = p ? p.pendingEntries.every((e) => entriesDone.includes(e.index)) : false;
  const needSigners = p ? p.envelopeSigners.every((r) => signed.includes(r.key)) : false;
  const gatesOk = st ? st.gates.every((g) => g.ok) : false;
  const evidence = JSON.stringify({ at: ranAt, browser, account: st?.config.admin ?? null, second: st?.config.second ?? null, sessionId: st?.sessionId ?? null, planFingerprint: st?.planFingerprint ?? null, progress: st?.progress ?? null, balances: st?.balances ?? null, steps: st?.steps.map((s) => ({ step: s.index, fn: s.fn, done: s.done, attempt: s.attempt })) ?? null, results }, null, 2);

  return (
    <main className="ss">
      <p className="ss-banner" role="note">Owner-run settlement on Stellar TESTNET. Moves exactly 1 base unit of the governed test token from the administrative account to the second account, one step at a time. Each submission needs your typed confirmation. <Link href="/sessions">Back to sessions</Link></p>
      <h2>One-unit settlement (Edge, Stellar Testnet)</h2>
      <p className="ss-actions"><button type="button" onClick={() => void refresh()} disabled={busy}>Re-read the chain</button></p>
      {st && (
        <>
          <dl className="ss-dl"><dt>Administrative account (debtor)</dt><dd><code>{st.config.admin}</code> balance {st.balances.admin ?? '?'}</dd><dt>Second account (creator, creditor)</dt><dd><code>{st.config.second}</code> balance {st.balances.second ?? '?'}</dd><dt>Token total supply</dt><dd>{st.balances.totalSupply ?? 'unreadable'}</dd><dt>Session id</dt><dd><code>{st.sessionId}</code></dd><dt>Plan fingerprint</dt><dd><code>{st.planFingerprint}</code></dd><dt>On chain</dt><dd>{st.progress}</dd></dl>
          <ul className="ss-checks" aria-label="Safety gates">{st.gates.map((g) => <li key={g.id}><span aria-hidden="true">{g.ok ? '✓' : '✗'}</span><span className="ss-sr">{g.ok ? 'Passed: ' : 'Failed: '}</span>{g.id}: {g.detail}</li>)}</ul>
          <table className="ss-list"><caption className="ss-sr">Steps</caption>
            <thead><tr>{['Step', 'Function', 'Who', 'On chain', 'Attempt'].map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
            <tbody>{st.steps.map((s) => <tr key={s.index}><td data-label="Step">{s.index}</td><td data-label="Function">{s.fn}</td><td data-label="Who">{s.signers.map(short).join(', ')}</td><td data-label="On chain"><span className={`ss-badge ss-${s.done ? 'ok' : 'neutral'}`}>{s.done ? 'DONE' : s.index === st.next ? 'NEXT' : 'waiting'}</span></td><td data-label="Attempt">{s.attempt ? <>{s.attempt.outcome} <code>{s.attempt.hash.slice(0, 12)}…</code>{!['SUCCESS', 'FAILED', 'REJECTED'].includes(s.attempt.outcome) && <button type="button" disabled={busy} onClick={() => void resolve(s.index)}>Read the hash</button>}</> : '—'}</td></tr>)}</tbody></table>
          {st.next !== null && !p && <p className="ss-actions"><button type="button" disabled={busy || !gatesOk} onClick={() => void prepare(st.next!)}>{`Prepare step ${st.next} (${st.steps[st.next - 1]?.fn})`}</button></p>}
          {st.next === null && <p role="status"><span className="ss-badge ss-ok">ALL STEPS ON CHAIN</span> Stage 6 reconciles this independently.</p>}
        </>
      )}
      {p && (
        <section aria-label="Current step">
          <h3>Step {p.step}: {p.fn}</h3>
          <dl className="ss-dl"><dt>Transaction source</dt><dd><code>{p.source}</code></dd><dt>Transaction hash</dt><dd><code>{hash}</code></dd><dt>Network fee (declared)</dt><dd>{p.fee} stroops (resource fee from the simulation: {p.minResourceFee ?? 'n/a'})</dd><dt>What it does</dt><dd>{p.note}</dd></dl>
          <p className="ss-actions">
            {p.pendingEntries.map((e) => <button key={e.index} type="button" disabled={busy || entriesDone.includes(e.index)} onClick={() => void signEntry(e)}>{`A. Sign authorization entry as ${short(e.address)}`}</button>)}
            {p.envelopeSigners.map((r) => <button key={r.key} type="button" disabled={busy || !needEntries || signed.includes(r.key)} onClick={() => void signEnvelope(r)}>{`B. Sign the transaction as ${r.role} (${short(r.key)})`}</button>)}
          </p>
          <label>Type exactly <code>I CONFIRM SUBMIT STEP {p.step}</code> to submit to Testnet <input value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" spellCheck={false} aria-label="Confirmation text" /></label>
          <p className="ss-actions"><button type="button" disabled={busy || !needEntries || !needSigners || confirm !== `I CONFIRM SUBMIT STEP ${p.step}`} onClick={() => void submit()}>{`Submit step ${p.step} to Testnet`}</button></p>
        </section>
      )}
      <ul className="ss-checks" aria-label="Progress">{log.map((l, i) => <li key={i}><span aria-hidden="true">{l.ok ? '✓' : '✗'}</span><span className="ss-sr">{l.ok ? 'Passed: ' : 'Failed: '}</span>{l.text}</li>)}</ul>
      <h3>Evidence (no secrets, no signatures)</h3>
      <pre className="ss-pre" aria-label="Evidence">{evidence}</pre>
    </main>
  );
}
