// The server-side sandbox singleton: the real TobinClearingV1 and TobinTestToken running in the Soroban test host behind the Rust development bridge.
// LOCAL ONLY: no Stellar network, no wallet, no key, nothing signed. Node runtime only (it spawns a child process); never import this from client code.
import { startSandbox } from 'tobin-mvp1-sdk/local/bridge';
import type { Sandbox } from 'tobin-mvp1-sdk/local/bridge';
import { toHex } from 'tobin-mvp1-sdk/amount';

export const NAMES = ['Alice', 'Bob', 'Carol', 'Dave', 'Erin'];

export interface BootInfo {
  description: string;
  clearing: string;
  networkId: string;
  personas: { name: string; address: string }[];
  tokens: { name: string; address: string; cap: string }[];
}

export interface Booted {
  sb: Pick<Sandbox, 'transport'> & Partial<Pick<Sandbox, 'close'>>;
  info: BootInfo;
}

async function boot(): Promise<Booted> {
  const exe = process.env['TOBIN_BRIDGE_EXE'];
  if (!exe) throw new Error('TOBIN_BRIDGE_EXE is not set: build the Rust development bridge first (see apps/web-console/README.md).');
  const sb = await startSandbox(exe, { actors: [...NAMES, 'Minter'], minter: 'Minter', cap: 1_000_000n });
  const second = String((await sb.bridge.request({ cmd: 'token', minter: sb.actors['Minter'], cap: '500000' })).address);
  return {
    sb,
    info: {
      description: sb.transport.description,
      clearing: sb.clearing,
      networkId: toHex(sb.networkId),
      personas: NAMES.map((name) => ({ name, address: sb.actors[name] as string })),
      tokens: [
        { name: 'TTT-A', address: sb.token, cap: '1000000' },
        { name: 'TTT-B', address: second, cap: '500000' },
      ],
    },
  };
}

// One sandbox per server process, created on first use and kept on globalThis so that module reloads in development do not leak bridge processes.
// A failed start is not cached, so the next request retries. The sandbox lives only in this process's memory and disappears when the process stops.
const slot = globalThis as unknown as { __tobinSandbox?: Promise<Booted> };

export function sandbox(): Promise<Booted> {
  if (!slot.__tobinSandbox) {
    const p = boot();
    slot.__tobinSandbox = p;
    p.catch(() => {
      if (slot.__tobinSandbox === p) delete slot.__tobinSandbox;
    });
  }
  return slot.__tobinSandbox;
}
