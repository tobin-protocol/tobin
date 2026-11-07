// The browser-side wallet sign-in sequence. LABEL: the wallet here is a hand-written MOCK of the Freighter API and the HTTP calls are MOCKS: this proves the state handling only.
// It is NOT evidence about the real extension (that is the owner-run Freighter validation) and NOT evidence about server verification (that is wallet-auth.test.ts, which is real).
import assert from 'node:assert/strict';
import test from 'node:test';
import { TESTNET_PASSPHRASE, runWalletSignIn, watchWallet } from '../lib/stellar/wallet-signin.ts';
import type { PostError, SignInState } from '../lib/stellar/wallet-signin.ts';
import type { FreighterLike } from '../lib/stellar/freighter-core.ts';

const ADDR = 'G' + 'A'.repeat(55); const OTHER = 'G' + 'B'.repeat(55);
interface Opts { connected?: boolean; allowed?: boolean; access?: { address?: string; error?: { message: string } }; network?: string; address?: string; sign?: () => Promise<{ signedMessage: string | Uint8Array | null; signerAddress: string; error?: { message: string } }> }
function mockWallet(o: Opts = {}): FreighterLike {
  const address = o.address ?? ADDR;
  return {
    isConnected: async () => ({ isConnected: o.connected ?? true }),
    isAllowed: async () => ({ isAllowed: o.allowed ?? true }),
    requestAccess: async () => (o.access?.error ? { address: '', error: o.access.error } : { address: o.access?.address ?? address }),
    getAddress: async () => ({ address }),
    getNetwork: async () => ({ network: o.network === undefined ? 'TESTNET' : o.network, networkPassphrase: o.network === undefined ? TESTNET_PASSPHRASE : 'Public Global Stellar Network ; September 2015' }),
    signTransaction: async () => { throw new Error('not used'); },
    signAuthEntry: async () => { throw new Error('not used'); },
    signMessage: o.sign ?? (async () => ({ signedMessage: Buffer.from('sig').toString('base64'), signerAddress: address })),
  } as unknown as FreighterLike;
}
const future = () => new Date(Date.now() + 60_000).toISOString();
function server(handlers: { challenge?: () => unknown; verify?: () => unknown } = {}) {
  const calls: { path: string; body: unknown }[] = [];
  const post = async <T,>(path: string, body: unknown): Promise<T> => {
    calls.push({ path, body });
    const h = path.endsWith('/challenge') ? handlers.challenge : handlers.verify;
    const out = h ? h() : path.endsWith('/challenge') ? { challenge: { id: 'a'.repeat(32), message: 'MESSAGE FROM THE SERVER', expiresAt: future() } } : { user: { id: 'u' }, onboarding: { step: 'profile' } };
    if (out instanceof Error) throw out; return out as T;
  };
  return { post, calls };
}
const httpError = (status: number): PostError => Object.assign(new Error('x'), { status });
const run = async (wallet: FreighterLike | undefined, srv = server(), extra: Partial<Parameters<typeof runWalletSignIn>[0]> = {}) => {
  const seen: SignInState[] = [];
  const out = await runWalletSignIn({ api: wallet, post: srv.post, onState: (s) => seen.push(s), ...extra });
  return { out, seen, srv };
};

test('the happy path goes through every state in order and signs exactly the text the SERVER issued (MOCK wallet, MOCK http)', async () => {
  let signed = '';
  const { out, seen, srv } = await run(mockWallet({ sign: async () => { signed = 'called'; return { signedMessage: Buffer.from('sig').toString('base64'), signerAddress: ADDR }; } }));
  assert.equal(out.state, 'authenticated'); assert.equal(signed, 'called');
  assert.deepEqual(seen, ['detecting', 'connecting', 'requesting-challenge', 'awaiting-approval', 'verifying', 'authenticated']);
  assert.deepEqual(srv.calls.map((c) => c.path), ['/api/auth/wallet/challenge', '/api/auth/wallet/verify']);
  assert.deepEqual(srv.calls[0]!.body, { publicKey: ADDR, network: 'testnet' });
  const v = srv.calls[1]!.body as { challengeId: string; signature: string; scheme: string };
  assert.equal(v.scheme, 'sep-53'); assert.equal(v.challengeId, 'a'.repeat(32)); assert.equal(v.signature, Buffer.from('sig').toString('base64'));
});
test('bytes from an older Freighter are sent as base64', async () => {
  const { srv } = await run(mockWallet({ sign: async () => ({ signedMessage: new Uint8Array([1, 2, 3]), signerAddress: ADDR }) }));
  assert.equal((srv.calls[1]!.body as { signature: string }).signature, Buffer.from([1, 2, 3]).toString('base64'));
});
test('Freighter unavailable, locked, refusing access, on the wrong network: each is a named state and nothing is requested from the server', async () => {
  for (const [wallet, state] of [
    [undefined, 'unavailable'], [mockWallet({ connected: false }), 'unavailable'],
    [mockWallet({ access: { error: { message: 'User declined access' } } }), 'rejected'],
    [mockWallet({ access: { error: { message: 'wallet is locked' } } }), 'locked'],
    [mockWallet({ access: { address: '' } }), 'locked'],
    [mockWallet({ network: 'PUBLIC' }), 'wrong-network'],
  ] as const) { const r = await run(wallet); assert.equal(r.out.state, state, state); assert.equal(r.srv.calls.length, 0); }
});
test('rejection of the signature, a timeout and a wallet error are different outcomes; none reaches the server verification', async () => {
  const rej = await run(mockWallet({ sign: async () => ({ signedMessage: null, signerAddress: '', error: { message: 'User declined to sign' } }) })); assert.equal(rej.out.state, 'rejected'); assert.equal(rej.srv.calls.length, 1);
  const none = await run(mockWallet({ sign: async () => ({ signedMessage: null, signerAddress: '' }) })); assert.equal(none.out.state, 'rejected');
  const err = await run(mockWallet({ sign: async () => ({ signedMessage: null, signerAddress: '', error: { message: 'internal wallet failure' } }) })); assert.equal(err.out.state, 'failed');
  const slow = await run(mockWallet({ sign: () => new Promise(() => undefined) }), server(), { timeoutMs: 20 }); assert.equal(slow.out.state, 'failed'); assert.match(slow.out.detail, /did not answer in time/);
  const thrown = await run(mockWallet({ sign: async () => { throw new Error('boom'); } })); assert.equal(thrown.out.state, 'failed');
});
test('the account changing while signing, and a challenge that expired before it was signed, are caught before verification', async () => {
  const swapped = await run(mockWallet({ sign: async () => ({ signedMessage: 'c2ln', signerAddress: OTHER }) })); assert.equal(swapped.out.state, 'account-changed'); assert.equal(swapped.srv.calls.length, 1, 'verify was not called');
  const expired = await run(mockWallet(), server({ challenge: () => ({ challenge: { id: 'b'.repeat(32), message: 'm', expiresAt: new Date(Date.now() - 1000).toISOString() } }) })); assert.equal(expired.out.state, 'expired'); assert.equal(expired.srv.calls.length, 1);
  const wrongAdd = await run(mockWallet(), server(), { expectAddress: OTHER, base: '/api/auth/wallet/link' }); assert.equal(wrongAdd.out.state, 'account-changed'); assert.equal(wrongAdd.srv.calls.length, 0);
});
test('server refusals: rate limit and a failed verification are shown without detail; a challenge failure is explained', async () => {
  assert.equal((await run(mockWallet(), server({ challenge: () => httpError(429) }))).out.state, 'rate-limited');
  assert.equal((await run(mockWallet(), server({ challenge: () => httpError(500) }))).out.state, 'failed');
  assert.equal((await run(mockWallet(), server({ verify: () => httpError(401) }))).out.state, 'failed');
  assert.equal((await run(mockWallet(), server({ verify: () => httpError(429) }))).out.state, 'rate-limited');
  const noSign = await run({ ...mockWallet(), signMessage: undefined } as unknown as FreighterLike); assert.equal(noSign.out.state, 'failed');
});
test('the add-a-wallet flow uses its own endpoints', async () => {
  const r = await run(mockWallet(), server(), { base: '/api/auth/wallet/link', expectAddress: ADDR }); assert.equal(r.out.state, 'authenticated');
  assert.deepEqual(r.srv.calls.map((c) => c.path), ['/api/auth/wallet/link/challenge', '/api/auth/wallet/link/verify']);
});
test('watching the wallet after sign-in: account change, network change and an absent wallet are told apart (no prompts)', async () => {
  assert.deepEqual(await watchWallet(mockWallet(), [ADDR]), { kind: 'ok', address: ADDR });
  assert.deepEqual(await watchWallet(mockWallet({ address: OTHER }), [ADDR]), { kind: 'account-changed', address: OTHER });
  assert.equal((await watchWallet(mockWallet({ network: 'PUBLIC' }), [ADDR])).kind, 'network-changed');
  assert.equal((await watchWallet(undefined, [ADDR])).kind, 'unavailable');
  assert.equal((await watchWallet(mockWallet({ allowed: false }), [ADDR])).kind, 'unavailable');
});
