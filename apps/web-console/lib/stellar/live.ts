// Live read of an account's signer set from the real network: Horizon AND the Soroban RPC, which must agree (see readLiveSignerSet). Read-only; no key.
import { Keypair, xdr } from '@stellar/stellar-sdk';
import { createServer } from './rpc.ts';
import { readLiveSignerSet } from './signer-set.ts';
import type { LiveSignerSet, Network } from './signer-set.ts';

const HORIZON: Record<Network, string> = { testnet: 'https://horizon-testnet.stellar.org', public: '' };

export async function fetchLiveSignerSet(account: string, network: Network = 'testnet'): Promise<LiveSignerSet> {
  if (network !== 'testnet') return { ok: false, reason: 'only Stellar Testnet is enabled' };
  const server = createServer();
  return readLiveSignerSet({
    account, network, horizon: HORIZON.testnet,
    fetcher: (url) => fetch(url, { signal: AbortSignal.timeout(15000) }) as never,
    viaRpc: async (a) => {
      const r = await server.getLedgerEntries(xdr.LedgerKey.account(new xdr.LedgerKeyAccount({ accountId: Keypair.fromPublicKey(a).xdrPublicKey() })));
      if (!r.entries?.[0]) throw new Error('the account does not exist');
      return (JSON.parse(JSON.stringify(r.entries[0].val, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))) as { account: { account_id: string; thresholds: string; signers: { key: string; weight: number }[] } }).account;
    },
  });
}
