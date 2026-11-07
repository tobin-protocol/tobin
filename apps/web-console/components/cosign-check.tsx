'use client';
// OWNER-RUN transaction-level co-signing test (MVP-1.5 stage 4), Microsoft Edge + Freighter on Stellar Testnet. The administrative multisig account needs the MEDIUM
// threshold (6) for a contract call: the Founder (weight 5) AND the Security signer (weight 1) together. This page asks YOU to sign a HARMLESS transaction that cannot
// execute (its sequence number is far ahead) with each required signer in turn, then has the server verify the real signatures against the LIVE signer set.
// NOTHING is submitted, no key leaves Freighter, and no signature or signed transaction is stored or shown here: only PASS/FAIL, weights and public identifiers.
import { useState } from 'react';
import Link from 'next/link';
import { api } from './api-client.ts';
import { browserName, inspectWallet, requestTransactionSignature } from '../lib/stellar/freighter.ts';
import type { FreighterLike } from '../lib/stellar/freighter.ts';

interface Prepared { account: string; passphrase: string; xdr: string; hash: string; fingerprint: string; thresholds: { low: number; medium: number; high: number }; signers: { key: string; weight: number }[]; required: { role: string; key: string }[]; minimalSets: string[][]; note: string }
interface Verified { ok: boolean; weight: number; threshold: number; signers: { key: string; weight: number }[]; problems: string[]; unchangedSincePrepared: boolean; freshSignerSet: boolean; policySatisfied: boolean; transactionHash: string; fingerprint: string }
async function loadApi(): Promise<FreighterLike | undefined> {
  try { const m = (await import('@stellar/freighter-api')) as unknown as { default?: FreighterLike } & FreighterLike; return (m.default ?? m) as FreighterLike; } catch { return undefined; }
}
const short = (k: string) => `${k.slice(0, 6)}…${k.slice(-6)}`;

export function CosignCheck() {
  const [p, setP] = useState<Prepared | null>(null);
  const [xdr, setXdr] = useState('');
  const [signed, setSigned] = useState<string[]>([]);
  const [log, setLog] = useState<{ ok: boolean; text: string }[]>([]);
  const [result, setResult] = useState<Verified | null>(null);
  const [busy, setBusy] = useState(false);
  const [ranAt, setRanAt] = useState<string | null>(null);
  const [browser, setBrowser] = useState<string | null>(null);
  const note = (ok: boolean, text: string) => setLog((l) => [...l, { ok, text }]);

  const prepare = async () => {
    setBusy(true); setLog([]); setResult(null); setSigned([]); setRanAt(new Date().toISOString()); setBrowser(browserName(navigator.userAgent));
    try { const r = await api<{ prepared: Prepared }>('POST', '/api/stellar/cosign', { action: 'prepare' }); setP(r.prepared); setXdr(r.prepared.xdr); note(true, 'Prepared a harmless transaction and read the LIVE signer set (Horizon and the RPC agree).'); }
    catch (e) { setP(null); note(false, 'Could not prepare: ' + (e as Error).message); } finally { setBusy(false); }
  };
  const signAs = async (r: { role: string; key: string }) => {
    if (!p) return; setBusy(true);
    try {
      const fr = await loadApi();
      const ra = (fr as unknown as { requestAccess?: () => Promise<{ error?: { message?: string } }> } | undefined)?.requestAccess;
      if (ra) { const g = await ra(); if (g.error) { note(false, 'Freighter refused access: ' + (g.error.message ?? 'rejected') + '. Approve the connection prompt for 127.0.0.1.'); return; } }
      const st = await inspectWallet(fr, { passphrase: p.passphrase, address: r.key });
      if (st.kind === 'ACCOUNT_MISMATCH') { note(false, `Freighter is on ${short(st.address)}. Switch Freighter to the ${r.role} account ${short(r.key)}, then press the button again.`); return; }
      if (st.kind !== 'READY') { note(false, `Freighter is not ready (${st.kind}${'reason' in st ? ': ' + st.reason : ''}).`); return; }
      const s = await requestTransactionSignature(fr, xdr, { passphrase: p.passphrase, address: r.key });
      if (!s.ok) { note(false, `${r.role}: ${s.kind}: ${s.reason}`); return; }
      setXdr(s.signedXdr); setSigned((x) => [...x, r.role]); note(true, `${r.role} signed. The returned transaction is identical and carries a valid signature by ${short(r.key)}.`);
    } finally { setBusy(false); }
  };
  const verify = async () => {
    setBusy(true);
    try { const r = await api<{ result: Verified }>('POST', '/api/stellar/cosign', { action: 'verify', xdr }); setResult(r.result); note(r.result.ok && r.result.policySatisfied, r.result.ok ? 'The server verified the signatures against the live signer set.' : 'The server found problems: ' + r.result.problems.join('; ')); }
    catch (e) { setResult(null); note(false, 'Verification refused: ' + (e as Error).message); } finally { setBusy(false); }
  };
  const evidence = JSON.stringify({ at: ranAt, browser, account: p?.account ?? null, transactionHash: result?.transactionHash ?? p?.hash ?? null, signerSetFingerprint: p?.fingerprint ?? null, signedBy: signed, combinedWeight: result?.weight ?? null, threshold: result?.threshold ?? null, signers: result?.signers.map((s) => s.key) ?? null, unchangedSincePrepared: result?.unchangedSincePrepared ?? null, freshSignerSet: result?.freshSignerSet ?? null, policySatisfied: result?.policySatisfied ?? null, verified: result?.ok ?? null, submitted: false }, null, 2);

  return (
    <main className="ss">
      <p className="ss-banner" role="note">Owner-run co-signing test. Testnet only. Nothing is submitted, nothing is stored, and no key leaves Freighter. Use Microsoft Edge with Freighter unlocked and set to Stellar Testnet. <Link href="/sessions">Back to sessions</Link></p>
      <h2>Co-signing the administrative account (Edge, Stellar Testnet)</h2>
      <p className="ss-note">Contract calls from the administrative account need the medium threshold. The transaction below is harmless and cannot execute. Sign it with the Founder, then switch Freighter to the Security account and sign again. A signature that does not verify, an unknown signer, or too little weight is reported as a failure.</p>
      <p className="ss-actions"><button type="button" onClick={() => void prepare()} disabled={busy}>1. Prepare the harmless transaction</button></p>
      {p && (
        <>
          <dl className="ss-dl"><dt>Account</dt><dd><code>{p.account}</code></dd><dt>Live thresholds</dt><dd>low {p.thresholds.low}, medium {p.thresholds.medium}, high {p.thresholds.high}</dd><dt>Live signers</dt><dd>{p.signers.map((s) => `${short(s.key)} (weight ${s.weight})`).join(', ')}</dd><dt>Signer-set fingerprint</dt><dd><code>{p.fingerprint.slice(0, 24)}…</code></dd><dt>Transaction hash</dt><dd><code>{p.hash.slice(0, 24)}…</code></dd><dt>Policy</dt><dd>{p.required.map((r) => `${r.role} ${short(r.key)}`).join(' and ')} must both sign</dd></dl>
          <p className="ss-note">{p.note}</p>
          <p className="ss-actions">{p.required.map((r, i) => <button key={r.role} type="button" disabled={busy || signed.includes(r.role)} onClick={() => void signAs(r)}>{`${i + 2}. Sign as ${r.role} (${short(r.key)})`}</button>)}<button type="button" disabled={busy || signed.length === 0} onClick={() => void verify()}>{`${p.required.length + 2}. Verify with the server`}</button></p>
        </>
      )}
      <ul className="ss-checks" aria-label="Progress">{log.map((l, i) => <li key={i}><span aria-hidden="true">{l.ok ? '✓' : '✗'}</span><span className="ss-sr">{l.ok ? 'Passed: ' : 'Failed: '}</span>{l.text}</li>)}</ul>
      {result && (
        <p><span className={`ss-badge ss-${result.ok && result.policySatisfied ? 'ok' : 'warn'}`}>{result.ok && result.policySatisfied ? 'PASS' : 'FAIL'}</span> weight {result.weight} of threshold {result.threshold}; unchanged since prepared: {String(result.unchangedSincePrepared)}; signer set fresh: {String(result.freshSignerSet)}; policy (Founder and Security): {String(result.policySatisfied)}.</p>
      )}
      <h3>Evidence to paste back (no secrets, no signatures)</h3>
      <pre className="ss-pre" aria-label="Evidence">{evidence}</pre>
    </main>
  );
}
