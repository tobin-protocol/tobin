// Test helpers for W0. Everything is in memory and uses the mock adapter. No signer, process, file, key or network is involved.
import { MockSignerAdapter } from '../lib/w0/mock-adapter.ts';
import type { MockScenario, MockAdapterDeps } from '../lib/w0/mock-adapter.ts';
import { ConsoleService } from '../lib/w0/service.ts';
import { InMemoryAuditStore, InMemoryIntentStore, InMemoryPreviewStore } from '../lib/w0/stores.ts';
import type { AuditStore } from '../lib/w0/stores.ts';
import { MOCK_BASELINE_HASH, MOCK_CONFIG_SHA256 } from '../lib/w0/deps.ts';
import type { AuditEvent, Principal } from '../lib/w0/types.ts';

export const T0 = Date.parse('2026-11-06T12:00:00Z');
export const viewer: Principal = { subject: 'v1', role: 'viewer' };
export const requester: Principal = { subject: 'r1', role: 'requester' };
export const requester2: Principal = { subject: 'r2', role: 'requester' };
export const approver: Principal = { subject: 'a1', role: 'approver' };

let counter = 0;
export const uuid = (): string => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`;

export class FailingAuditStore implements AuditStore {
  failing = false;
  readonly inner = new InMemoryAuditStore();
  append(e: AuditEvent): void { if (this.failing) throw new Error('disk full'); this.inner.append(e); }
  list(f: Parameters<AuditStore['list']>[0]) { return this.inner.list(f); }
  get(id: string) { return this.inner.get(id); }
}

export function build(opts: { scenario?: MockScenario; checks?: MockAdapterDeps['checks']; now?: { t: number } } = {}) {
  const clock = opts.now ?? { t: T0 };
  const audit = new FailingAuditStore();
  const intents = new InMemoryIntentStore();
  const previews = new InMemoryPreviewStore();
  const now = () => new Date(clock.t);
  const adapter = new MockSignerAdapter({ scenario: opts.scenario ?? 'unpinned', audit, intents, now, baselineHash: MOCK_BASELINE_HASH, ...(opts.checks ? { checks: opts.checks } : {}) });
  const service = new ConsoleService({ adapter, audit, intents, previews, now, newId: uuid, expected: { baselineHash: MOCK_BASELINE_HASH, configSha256: MOCK_CONFIG_SHA256 } });
  return { service, audit, intents, previews, adapter, clock };
}

export function intentFor(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    approvalId: uuid(), operation: 'deploy', baselineHash: MOCK_BASELINE_HASH, configSha256: MOCK_CONFIG_SHA256,
    requestedBy: 'r1', approvedBy: 'a1', approvedAt: '2026-11-06T12:00:00Z', expiresAt: '2026-11-06T13:00:00Z', ...over,
  };
}
