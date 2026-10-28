// The transport boundary. The SDK prepares calls and states the authorizations they need; a Transport carries them out.
//
// IMPLEMENTED: only the LOCAL sandbox transport (src/local/bridge.ts), which runs the real contracts in the Soroban test host and applies the
// stated authorizations as simulated, unsigned grants that the real contract still enforces.
//
// NOT IMPLEMENTED, NOT AUTHORIZED (DB-13): a network transport. It would have to (1) simulate the transaction to obtain the authorization
// entries, (2) have each required signer sign its entry with a wallet, (3) assemble the transaction with a source account and fee,
// (4) submit it and wait for confirmation, (5) read the result back from the ledger. None of that exists here, and no part of this SDK
// treats a call as settled on a network. `NetworkTransportNotAuthorized` makes the gap explicit instead of faking a result.
import type { PreparedCall } from './prepare.ts';

export interface Resources {
  instructions?: number;
  memBytes?: number;
  writeEntries?: number;
  writeBytes?: number;
}

export type InvocationResult =
  | { ok: true; value: unknown; eventCount?: number; resources?: Resources }
  | { ok: false; errorType: string; code: number | null; codeName?: string; detail?: string };

export interface InvokeOptions {
  /** the signers that actually grant their authorization; default: every required signer. Withholding one makes the contract reject. */
  authorize?: readonly string[];
}

export interface Transport {
  /** A short statement of what this transport really does, shown to users (for example "local sandbox: Soroban test host, no network"). */
  readonly description: string;
  invoke(call: PreparedCall, options?: InvokeOptions): Promise<InvocationResult>;
}

export class NetworkTransportNotAuthorized implements Transport {
  readonly description = 'network transport: not implemented (wallet and network work need separate explicit authorization, DB-13)';
  invoke(call: PreparedCall): Promise<InvocationResult> {
    return Promise.reject(new Error(`cannot call ${call.fn}: ${this.description}`));
  }
}
