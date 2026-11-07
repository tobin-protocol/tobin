'use client';
// Guided first-time onboarding: welcome, profile, institution (create or join), ready. Progress lives on the SERVER (the profile flag and the memberships), so a refresh, a second device or a
// failed request never makes the user start again. Creating an institution makes the creator its application administrator and nothing more: no reviewer authority, no Stellar signing
// authority, no settlement authority beyond what separate policy grants.
import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { api, ApiError } from './api-client.ts';

interface View {
  user: { id: string; displayName: string };
  onboarding: { step: 'profile' | 'organization' | 'done'; profileDone: boolean };
  organizations: { id: string; name: string; role: string }[];
  lastOrgId: string | null;
}
const TYPES: [string, string][] = [['', 'Not specified'], ['bank', 'Bank'], ['payment-institution', 'Payment institution'], ['broker-dealer', 'Broker-dealer'], ['fintech', 'Fintech'], ['corporate-treasury', 'Corporate treasury'], ['other', 'Other']];
const STEPS = ['Welcome', 'Your profile', 'Your institution', 'Ready'] as const;

export function Onboarding() {
  const [view, setView] = useState<View | null>(null);
  const [welcomed, setWelcomed] = useState(false);
  const [mode, setMode] = useState<'choose' | 'create' | 'join'>('choose');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [orgName, setOrgName] = useState(''); const [orgType, setOrgType] = useState(''); const [country, setCountry] = useState(''); const [desc, setDesc] = useState('');
  const [token, setToken] = useState('');

  const load = useCallback(async () => {
    try { const v = await api<View>('GET', '/api/auth/me'); setView(v); setName((n) => n || (v.onboarding.profileDone ? v.user.displayName : '')); }
    catch (e) { if (e instanceof ApiError && e.status === 401) window.location.assign('/sign-in'); else setError((e as Error).message); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const run = async (fn: () => Promise<void>) => { setError(null); setBusy(true); try { await fn(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } };
  const saveProfile = (ev: FormEvent) => { ev.preventDefault(); void run(async () => { await api('POST', '/api/auth/profile', { displayName: name }); await load(); }); };
  const createOrg = (ev: FormEvent) => {
    ev.preventDefault();
    void run(async () => {
      const r = await api<{ organization: { id: string } }>('POST', '/api/registry/orgs', { name: orgName, description: desc, institutionType: orgType, jurisdiction: country.trim().toUpperCase() });
      await api('POST', '/api/auth/workspace', { orgId: r.organization.id });
      await load();
    });
  };
  const joinOrg = (ev: FormEvent) => {
    ev.preventDefault();
    void run(async () => {
      const r = await api<{ membership: { orgId: string } }>('POST', '/api/registry/invitations/accept', { token: token.trim() });
      await api('POST', '/api/auth/workspace', { orgId: r.membership.orgId });
      setToken(''); await load();
    });
  };

  if (!view) return <main className="ss"><p role="status">{error ?? 'Loading…'}</p></main>;
  const step = view.onboarding.step === 'profile' ? (welcomed ? 1 : 0) : view.onboarding.step === 'organization' ? 2 : 3;
  const lastOrg = view.organizations.find((o) => o.id === view.lastOrgId) ?? view.organizations[0];

  return (
    <main className="ss wf">
      <h2>Set up your workspace</h2>
      <ol className="wf-steps" aria-label={`Progress: step ${step + 1} of ${STEPS.length}`}>
        {STEPS.map((s, i) => <li key={s} aria-current={i === step ? 'step' : undefined} data-done={i < step}>{i + 1}. {s}{i < step ? ' ✓' : ''}</li>)}
      </ol>
      {error && <p className="ss-error" role="alert">{error}</p>}

      {step === 0 && (
        <section className="wf-card" aria-label="Welcome">
          <h3>You are signed in</h3>
          <p>Your wallet is verified, so Tobin knows which wallet is yours. That is all it proves. You are not yet a member of any institution, and Tobin has not given you any role. Next you will choose a name, then create an institution or join one you were invited to.</p>
          <p className="ss-note">Keep at least one verified wallet that you control. If you lose access to every verified wallet, Tobin cannot restore your account: there is no administrator override and no support recovery.</p>
          <button type="button" className="wf-primary" onClick={() => setWelcomed(true)}>Continue</button>
        </section>
      )}

      {step === 1 && (
        <form className="wf-card inst-form" onSubmit={saveProfile} aria-label="Your profile">
          <h3 style={{ flexBasis: '100%' }}>Your profile</h3>
          <label>Display name <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required autoComplete="name" aria-label="Display name" /></label>
          <small>This is the name other members of your institution see. It is not verified identity.</small>
          <button type="submit" className="wf-primary" disabled={busy || name.trim().length < 1}>Save and continue</button>
        </form>
      )}

      {step === 2 && (
        <>
          {mode === 'choose' && (
            <section className="wf-card" aria-label="Choose how to start">
              <h3>Create or join an institution</h3>
              <div className="wf-actions">
                <button type="button" className="wf-primary" onClick={() => setMode('create')}>Create an institution</button>
                <button type="button" onClick={() => setMode('join')}>Join with an invitation</button>
              </div>
              <p className="ss-note">There is no personal workspace: clearing sessions belong to an institution, so you need to create or join one to continue. Tobin does not create placeholder institutions.</p>
            </section>
          )}
          {mode === 'create' && (
            <form className="wf-card inst-form" onSubmit={createOrg} aria-label="Create an institution">
              <h3 style={{ flexBasis: '100%' }}>Create an institution</h3>
              <label>Institution name <input value={orgName} onChange={(e) => setOrgName(e.target.value)} maxLength={80} required aria-label="Institution name" /></label>
              <label>Type <select value={orgType} onChange={(e) => setOrgType(e.target.value)} aria-label="Institution type">{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
              <label>Country code <input value={country} onChange={(e) => setCountry(e.target.value)} maxLength={2} placeholder="GB" pattern="[A-Za-z]{2}" aria-label="Country code" /></label>
              <label>Description (optional) <textarea value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={500} rows={3} aria-label="Description" /></label>
              <small>You become this institution&apos;s administrator. That is an application role only: it is not reviewer authority, not Stellar signing authority and not contract administration.</small>
              <div className="wf-actions"><button type="submit" className="wf-primary" disabled={busy || orgName.trim().length < 2}>Create institution</button><button type="button" onClick={() => { setMode('choose'); setError(null); }}>Back</button></div>
            </form>
          )}
          {mode === 'join' && (
            <form className="wf-card inst-form" onSubmit={joinOrg} aria-label="Join with an invitation">
              <h3 style={{ flexBasis: '100%' }}>Join with an invitation</h3>
              <label>Invitation code <input value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" spellCheck={false} aria-label="Invitation code" /></label>
              <small>You get exactly the role the invitation offers. An invitation addressed to an email or to a wallet can only be accepted by that person.</small>
              <div className="wf-actions"><button type="submit" className="wf-primary" disabled={busy || token.trim().length < 16}>Accept invitation</button><button type="button" onClick={() => { setMode('choose'); setError(null); }}>Back</button></div>
            </form>
          )}
        </>
      )}

      {step === 3 && (
        <section className="wf-card" aria-label="Ready">
          <h3>You are ready</h3>
          <p>{lastOrg ? <>Your workspace is <strong>{lastOrg.name}</strong> (your role: {lastOrg.role}).</> : 'Your account is set up.'}</p>
          <div className="wf-actions"><button type="button" className="wf-primary" onClick={() => window.location.assign('/sessions')}>Enter workspace</button></div>
        </section>
      )}
    </main>
  );
}
