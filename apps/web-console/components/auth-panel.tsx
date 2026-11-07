'use client';
// Sign in / create account. The server sets the HttpOnly session cookie; this component never sees or stores a token.
import { useState } from 'react';
import type { FormEvent } from 'react';
import { api } from './api-client.ts';

type Mode = 'signin' | 'register';

export function AuthPanel({ embedded = false }: { embedded?: boolean } = {}) {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (ev: FormEvent) => {
    ev.preventDefault(); setError(null); setBusy(true);
    try {
      await api('POST', mode === 'signin' ? '/api/auth/login' : '/api/auth/register', mode === 'signin' ? { email, password } : { email, password, displayName });
      window.location.assign('/sessions');
    } catch (e) { setError((e as Error).message); setBusy(false); }
  };

  const Root = (embedded ? 'div' : 'main') as 'div';
  return (
    <Root className={embedded ? 'wf-legacy' : 'ss'} aria-live="polite">
      {embedded ? <h3>Existing email account</h3> : <h2>{mode === 'signin' ? 'Sign in' : 'Create an account'}</h2>}
      <p className="ss-note">{embedded ? 'Accounts created with an email address keep working. ' : ''}Accounts are stored in this application. Signing in with an email does not use a wallet and does not touch the Stellar network.</p>
      <form onSubmit={submit} className="inst-form">
        {mode === 'register' && <label>Name <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={80} required autoComplete="name" /></label>}
        <label>Email <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} required autoComplete="email" /></label>
        <label>Password <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} maxLength={128} minLength={mode === 'register' ? 12 : undefined} required autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} /></label>
        {mode === 'register' && <small>At least 12 characters.</small>}
        <button type="submit" disabled={busy}>{mode === 'signin' ? 'Sign in' : 'Create account'}</button>
      </form>
      {error && <p className="ss-error" role="alert">{error}</p>}
      <p>
        {mode === 'signin'
          ? <>No account yet? <button type="button" className="ss-link" onClick={() => { setMode('register'); setError(null); }}>Create one</button></>
          : <>Already registered? <button type="button" className="ss-link" onClick={() => { setMode('signin'); setError(null); }}>Sign in</button></>}
      </p>
    </Root>
  );
}
