// LOCAL SANDBOX transport (Node only). Spawns the Rust development bridge (core/clearing/examples/bridge.rs), which hosts the REAL
// TobinClearingV1 and TobinTestToken in the Soroban test host and enforces the stated authorization trees. This is a local development
// world: no network, no wallet, no signatures, no transaction envelope, nothing on any ledger. A "grant" here is a simulated authorization
// that the real contract still checks against the exact call; it is not evidence that any wallet can produce such an authorization.
import { spawn } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fromHex } from '../amount.ts';
import type { PreparedCall } from '../sdk/prepare.ts';
import type { InvocationResult, InvokeOptions, Resources, Transport } from '../sdk/transport.ts';

type Reply = Record<string, unknown> & { ok: boolean };

export class BridgeProcess {
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly waiting: ((r: Reply) => void)[] = [];
  private chain: Promise<unknown> = Promise.resolve();

  constructor(exe: string, args: string[] = []) {
    this.child = spawn(exe, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    createInterface({ input: this.child.stdout }).on('line', (line) => {
      const w = this.waiting.shift();
      if (w) w(JSON.parse(line) as Reply);
    });
    this.child.stderr.on('data', () => {});
  }

  /** One request, one reply, strictly in order. */
  request(req: Record<string, unknown>): Promise<Reply> {
    const run = (): Promise<Reply> =>
      new Promise((resolve) => {
        this.waiting.push(resolve);
        this.child.stdin.write(JSON.stringify(req) + '\n');
      });
    const p = this.chain.then(run, run);
    this.chain = p.catch(() => {});
    return p;
  }

  close(): void {
    this.child.stdin.end();
    this.child.kill();
  }
}

export class BridgeTransport implements Transport {
  readonly description = 'LOCAL SANDBOX: the real contracts in the Soroban test host; simulated unsigned authorizations; no network, no wallet, nothing on any ledger';
  readonly bridge: BridgeProcess;
  constructor(bridge: BridgeProcess) {
    this.bridge = bridge;
  }

  async invoke(call: PreparedCall, options?: InvokeOptions): Promise<InvocationResult> {
    const granted = options?.authorize ? new Set(options.authorize) : null;
    const auths = call.auths.filter((a) => !granted || granted.has(a.signer)).map((a) => ({ who: a.signer, root: a.invocation }));
    const r = await this.bridge.request({ cmd: 'invoke', contract: call.contract, fn: call.fn, args: call.args, auths });
    if (r.ok) {
      const out: InvocationResult = { ok: true, value: r['value'] };
      if (typeof r['eventCount'] === 'number') out.eventCount = r['eventCount'];
      if (r['resources'] && typeof r['resources'] === 'object') out.resources = r['resources'] as Resources;
      return out;
    }
    const err: InvocationResult = { ok: false, errorType: String(r['errorType']), code: r['code'] === null || r['code'] === undefined ? null : Number(r['code']) };
    if (typeof r['codeName'] === 'string') err.codeName = r['codeName'];
    if (typeof r['detail'] === 'string') err.detail = r['detail'];
    return err;
  }
}

export interface Sandbox {
  bridge: BridgeProcess;
  transport: BridgeTransport;
  clearing: string;
  token: string;
  networkId: Uint8Array;
  actors: Record<string, string>;
  close(): void;
}

/** Start a sandbox: actors (contract-kind test addresses), one deployed clearing contract and one token whose fixed minter is `minter`. */
export async function startSandbox(exe: string, opts: { actors: (string | { name: string; kind?: 'account' | 'contract' })[]; minter: string; cap: bigint; accounts?: boolean }): Promise<Sandbox> {
  const bridge = new BridgeProcess(exe, opts.accounts ? ['--accounts'] : []);
  const actors: Record<string, string> = {};
  for (const a of opts.actors) {
    const spec = typeof a === 'string' ? { name: a } : a;
    actors[spec.name] = String((await bridge.request({ cmd: 'actor', ...spec }))['address']);
  }
  const minterAddr = actors[opts.minter] ?? String((await bridge.request({ cmd: 'actor', name: opts.minter }))['address']);
  const token = String((await bridge.request({ cmd: 'token', minter: minterAddr, cap: opts.cap.toString() }))['address']);
  const clearing = String((await bridge.request({ cmd: 'clearing' }))['address']);
  const networkId = fromHex(String((await bridge.request({ cmd: 'network' }))['networkId']));
  return { bridge, transport: new BridgeTransport(bridge), clearing, token, networkId, actors, close: () => bridge.close() };
}
