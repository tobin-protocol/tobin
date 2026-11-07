'use client';
// Wallet-first welcome and sign-in. A wallet signature proves control of a key; Tobin then finds or creates the internal user. It grants no institutional role, no membership and no
// signing authority. The server issues the challenge and verifies the signature; this component only drives Freighter and shows what happened. Nothing is kept in browser storage.
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api-client.ts';
import { AuthPanel } from './auth-panel.tsx';
import { inspectWallet } from '../lib/stellar/freighter-core.ts';
import { TESTNET_PASSPHRASE, loadFreighter, runWalletSignIn } from '../lib/stellar/wallet-signin.ts';
import type { SignInState } from '../lib/stellar/wallet-signin.ts';

interface VerifyResponse { isNew?: boolean; onboarding?: { step: 'profile' | 'organization' | 'done' } }
const TONE: Partial<Record<SignInState, 'ok' | 'warn' | 'busy'>> = {
  detecting: 'busy', connecting: 'busy', 'requesting-challenge': 'busy', 'awaiting-approval': 'busy', verifying: 'busy', authenticated: 'ok',
  unavailable: 'warn', locked: 'warn', 'wrong-network': 'warn', rejected: 'warn', expired: 'warn', failed: 'warn', 'rate-limited': 'warn', 'account-changed': 'warn', 'network-changed': 'warn',
};
const BUSY: SignInState[] = ['detecting', 'connecting', 'requesting-challenge', 'awaiting-approval', 'verifying'];
const RETRY: SignInState[] = ['failed', 'rejected', 'expired', 'rate-limited', 'account-changed', 'network-changed', 'locked', 'wrong-network'];

export function WalletSignIn() {
  const [state, setState] = useState<SignInState>('initial');
  const [detail, setDetail] = useState('Connect Freighter to sign in. You will be asked to approve a message that signs no transaction.');
  const [hint, setHint] = useState<string | null>(null);
  const run = useRef(0); // a cancelled or superseded attempt must not change the screen or sign anyone in

  // A returning user whose session is still valid does not need the welcome screen again: the server decides, and the destination is re-derived from the server state.
  useEffect(() => {
    api<{ onboarding?: { step: string } }>('GET', '/api/auth/me').then((r) => window.location.replace(r.onboarding && r.onboarding.step !== 'done' ? '/onboarding' : '/sessions'), () => undefined);
  }, []);

  // Look once, without prompting, so that a missing wallet is explained before the user clicks.
  useEffect(() => {
    let live = true;
    void (async () => {
      const st = await inspectWallet(await loadFreighter(), { passphrase: TESTNET_PASSPHRASE });
      if (!live) return;
      if (st.kind === 'UNAVAILABLE') { setState('unavailable'); setDetail('Freighter was not found in this browser. Install the Freighter extension, unlock it, and reload this page.'); }
      else if (st.kind === 'READY') setHint('Freighter is unlocked on Stellar Testnet. Press Connect wallet to sign in.');
      else if (st.kind === 'WRONG_NETWORK') { setState('wrong-network'); setDetail(`Freighter is on "${st.network}". Switch it to Stellar Testnet, then press Connect wallet.`); }
    })();
    return () => { live = false; };
  }, []);

  const connect = useCallback(async () => {
    const mine = ++run.current;
    setHint(null);
    const out = await runWalletSignIn({
      api: await loadFreighter(),
      post: (path, body) => api('POST', path, body),
      onState: (s, d) => { if (run.current === mine) { setState(s); setDetail(d); } },
    });
    if (run.current !== mine) return; // cancelled
    setState(out.state); setDetail(out.detail);
    if (out.state === 'authenticated') {
      const r = out.response as VerifyResponse | undefined;
      window.location.assign(r?.onboarding && r.onboarding.step !== 'done' ? '/onboarding' : '/sessions');
    }
  }, []);
  const cancel = () => { run.current++; setState('initial'); setDetail('Cancelled. Nothing was signed.'); };

  const busy = BUSY.includes(state) || state === 'authenticated';
  const tone = TONE[state];
  return (
    <main className="ss wf">
      <section className="wf-hero" aria-labelledby="wf-title">
        <h2 id="wf-title">Welcome to Tobin</h2>
        <p className="wf-lead">Tobin is an institutional clearing and settlement workspace built on Stellar. Institutions record the payments they owe each other, net them, approve the result, and settle only what remains.</p>
        <ol className="wf-how" aria-label="How wallet sign-in works">
          <li>Connect your Stellar wallet (Freighter).</li>
          <li>Approve a one-time message. It signs no transaction and moves no money.</li>
          <li>Tobin recognises you, then you create or join an institution.</li>
        </ol>
        <div className="wf-actions">
          <button type="button" className="wf-primary" onClick={() => void connect()} disabled={busy}>{RETRY.includes(state) ? 'Try again' : 'Connect wallet'}</button>
          {BUSY.includes(state) && <button type="button" onClick={cancel}>Cancel</button>}
          <span className="ss-note">Supported wallet: Freighter, on Stellar Testnet.</span>
        </div>
        <div className="wf-status" data-tone={tone} role={tone === 'warn' ? 'alert' : 'status'} aria-live="polite" data-state={state}>
          <strong>{state === 'initial' ? 'Ready' : state.replace(/-/g, ' ')}</strong>: {detail}
          {hint && state === 'initial' && <><br />{hint}</>}
          {state === 'unavailable' && <><br /><a href="https://www.freighter.app/" target="_blank" rel="noopener noreferrer">Get Freighter</a></>}
        </div>
        <p className="ss-note">Connecting a wallet proves you control that wallet. It does not make you a member or administrator of any institution: that comes from creating an institution or accepting an invitation, and every action is checked by the server.</p>
      </section>
      <section className="wf-secondary" aria-label="Existing email account">
        <AuthPanel embedded />
      </section>
    </main>
  );
}
