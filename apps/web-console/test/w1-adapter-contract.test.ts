// Runs the reusable adapter contract suite against the W0 MOCK adapter in every scripted scenario. No other adapter exists or is authorised.
import { MockSignerAdapter, MOCK_SCENARIOS } from '../lib/w0/mock-adapter.ts';
import { InMemoryAuditStore, InMemoryIntentStore } from '../lib/w0/stores.ts';
import { MOCK_BASELINE_HASH } from '../lib/w0/deps.ts';
import { runAdapterContract } from './w1-adapter-contract.ts';

for (const scenario of MOCK_SCENARIOS) {
  runAdapterContract(`mock/${scenario}`, () => {
    const audit = new InMemoryAuditStore();
    const intents = new InMemoryIntentStore();
    const adapter = new MockSignerAdapter({ scenario, audit, intents, now: () => new Date('2026-11-06T12:00:00Z'), baselineHash: MOCK_BASELINE_HASH });
    return { adapter, audit, intents, isMock: true };
  });
}
