// Browser-side transport: forwards prepared calls to the local Console server, which hands them to the local sandbox (the real contracts in the
// Soroban test host). It is NOT a network transport: the server runs on this machine, talks to no Stellar network, and signs nothing.
import type { InvocationResult, InvokeOptions, PreparedCall, Transport } from 'tobin-mvp1-sdk/sdk';

export class HttpTransport implements Transport {
  readonly description: string;
  private readonly url: string;
  constructor(url: string, description: string) {
    this.url = url;
    this.description = description;
  }

  async invoke(call: PreparedCall, options?: InvokeOptions): Promise<InvocationResult> {
    const res = await fetch(this.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ call, authorize: options?.authorize ?? null }),
    });
    if (!res.ok) throw new Error(`the local sandbox server answered ${res.status}`);
    return (await res.json()) as InvocationResult;
  }
}
