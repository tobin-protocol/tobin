'use client';
// Wallet ownership verification (manual, challenge-based). No wallet extension, no Stellar network and no transaction is involved: Tobin shows a one-time message,
// the key holder signs it OUTSIDE Tobin (for example with a CLI or a wallet that can sign messages), and Tobin verifies the signature on the server.
// A verified key proves control of that key only. It grants no role, no reviewer capability and no signing authority in Tobin.
import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { api } from './api-client.ts';
import { Buffer } from 'buffer';

interface Verification { userId: string; name: string; network: string; publicKey: string; verifiedAt: string }
interface Challenge { id: string; network: string; publicKey: string; message: string; expiresAt: string }

export function WalletVerification({ orgId }: { orgId: string }) {
  const [list, setList] = useState<Verification[] | null>(null);
  const [network, setNetwork] = useState<'testnet' | 'public'>('testnet');
  const [publicKey, setPublicKey] = useState('');
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [signature, setSignature] = useState('');
  const [scheme, setScheme] = useState<'raw' | 'sep-53'>('raw');
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { const r = await api<{ verifications: Verification[] }>('GET', `/api/registry/orgs/${orgId}/wallet-verifications`); setList(r.verifications); setLoadError(null); }
    catch (e) { setLoadError((e as Error).message); }
  }, [orgId]);
  useEffect(() => { setChallenge(null); setSignature(''); void load(); }, [load]);

  const request = async (ev: FormEvent) => {
    ev.preventDefault(); setError(null); setOk(null);
    try { const r = await api<{ challenge: Challenge }>('POST', `/api/registry/orgs/${orgId}/wallet-challenges`, { network, publicKey: publicKey.trim() }); setChallenge(r.challenge); setSignature(''); }
    catch (e) { setError((e as Error).message); }
  };
  // Signs the challenge with the owner's real Freighter (signMessage). The account must be the active one; the signature is then verified by the SERVER like any other.
  const signWithFreighter = async () => {
    if (!challenge) return; setError(null); setOk(null);
    try {
      const m = (await import('@stellar/freighter-api')) as unknown as { default?: unknown } & Record<string, unknown>;
      const fr = (m.default ?? m) as { getAddress(): Promise<{ address: string; error?: { message?: string } }>; signMessage(msg: string, o?: { address?: string; networkPassphrase?: string }): Promise<{ signedMessage: Uint8Array | string | null; signerAddress: string; error?: { message?: string } }> };
      const ra = (fr as unknown as { requestAccess?: () => Promise<{ address: string; error?: { message?: string } }> }).requestAccess;
      if (ra) { const g = await ra(); if (g.error) { setError('Freighter refused access: ' + (g.error.message ?? 'rejected') + '. Approve the connection prompt for 127.0.0.1 and try again.'); return; } }
      const a = await fr.getAddress();
      if (a.error || !a.address) { setError('Freighter did not return an account: ' + (a.error?.message ?? 'locked or not connected')); return; }
      if (a.address !== challenge.publicKey) { setError('Freighter is on ' + a.address.slice(0, 6) + '…' + a.address.slice(-6) + ', not ' + challenge.publicKey.slice(0, 6) + '…' + challenge.publicKey.slice(-6) + '. Switch Freighter to that account and try again.'); return; }
      const r = await fr.signMessage(challenge.message, { address: challenge.publicKey });
      if (r.error || !r.signedMessage) { setError('Freighter did not sign: ' + (r.error?.message ?? 'rejected')); return; }
      const raw = typeof r.signedMessage === 'string' ? r.signedMessage : Buffer.from(r.signedMessage).toString('base64');
      setSignature(raw); setScheme('sep-53'); setOk('Freighter returned a signature. Press "Verify signature": the server checks it. (Scheme set to SEP-53: if verification fails, try the raw scheme.)');
    } catch (e) { setError('Could not use Freighter: ' + String((e as Error).message ?? e).slice(0, 160)); }
  };
  const verify = async (ev: FormEvent) => {
    ev.preventDefault(); if (!challenge) return; setError(null); setOk(null);
    try { await api('POST', `/api/registry/orgs/${orgId}/wallet-challenges/${challenge.id}/verify`, { signature: signature.trim(), scheme }); setOk('Ownership of the key is proven. This grants no role or permission.'); setChallenge(null); setPublicKey(''); setSignature(''); await load(); }
    catch (e) { setError((e as Error).message); }
  };

  return (
    <section aria-label="Stellar account verification">
      <h3>Stellar account verification</h3>
      <p className="ss-note">A Stellar public key typed into a form, or a connected wallet, proves nothing. To prove you control a key, sign a one-time message with it and paste the signature here. This signs no transaction, authorizes no payment, and grants no role, reviewer capability or signing authority in Tobin. The Sign with Freighter button only asks your own Freighter to sign this one message; Tobin never sees a key, and a signature proves control of the key only.</p>
      {error && <p className="ss-error" role="alert">{error}</p>}
      {ok && <p className="ss-notice" role="status">{ok}</p>}
      {loadError && <p className="ss-error" role="alert">Could not load verified accounts: {loadError} <button type="button" onClick={() => void load()}>Retry</button></p>}
      {list === null && !loadError && <p className="ss-empty" role="status">Loading verified accounts…</p>}
      {list !== null && list.length === 0 && <p className="ss-empty">No Stellar accounts have been verified in this organization yet.</p>}
      {list !== null && list.length > 0 && (
        <table className="ss-list"><caption className="ss-sr">Verified Stellar accounts</caption>
          <thead><tr>{['Member', 'Network', 'Public key', 'Verified'].map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
          <tbody>{list.map((v) => <tr key={v.network + v.publicKey}><td data-label="Member">{v.name}</td><td data-label="Network">{v.network}</td><td data-label="Public key"><code>{v.publicKey}</code></td><td data-label="Verified">{v.verifiedAt.slice(0, 19)}</td></tr>)}</tbody>
        </table>
      )}
      <form className="inst-form" onSubmit={request} aria-label="Request a challenge">
        <label>Network <select value={network} onChange={(e) => setNetwork(e.target.value as 'testnet' | 'public')} aria-label="Network"><option value="testnet">testnet</option><option value="public">public (Mainnet)</option></select></label>
        <label>Stellar public key <input value={publicKey} onChange={(e) => setPublicKey(e.target.value)} placeholder="G…" autoComplete="off" spellCheck={false} aria-label="Stellar public key" /></label>
        <button type="submit" disabled={!publicKey.trim()}>Request challenge</button>
      </form>
      {challenge && (
        <form className="inst-form" onSubmit={verify} aria-label="Verify signature">
          <p className="ss-note" style={{ flexBasis: '100%' }}>Sign exactly this message with key {challenge.publicKey.slice(0, 8)}… (valid until {challenge.expiresAt.slice(0, 19)}):</p>
          <pre className="ss-pre" aria-label="Challenge message">{challenge.message}</pre>
          <label>Scheme <select value={scheme} onChange={(e) => setScheme(e.target.value as 'raw' | 'sep-53')} aria-label="Signature scheme"><option value="raw">raw ed25519 over the message</option><option value="sep-53">SEP-53 message signature</option></select></label>
          <label>Signature (base64) <input value={signature} onChange={(e) => setSignature(e.target.value)} autoComplete="off" spellCheck={false} aria-label="Signature in base64" /></label>
          <button type="button" onClick={() => void signWithFreighter()}>Sign with Freighter</button>
          <button type="submit" disabled={!signature.trim()}>Verify signature</button>
        </form>
      )}
    </section>
  );
}
