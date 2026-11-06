// The W0 signer adapter: a deterministic MOCK. It imports no signer module, starts no process, reads no file, opens no socket and holds no key.
// Its only imports are sibling pure modules. test/w0-isolation.test.ts proves this statically. A future, separately authorised adapter must
// implement the same SignerAdapter interface (types.ts); it is NOT built here.
import { sha256Hex } from './hash.ts';
import { evaluateReadiness, MOCK_CHECKS } from './readiness.ts';
import type { AuditStore, IntentStore } from './stores.ts';
import type { AuditEvent, AuditFilter, CheckStatus, OperatorApprovalIntent, PreviewRequest, PreviewResult, ReadinessCheckId, ReadinessReport, SignerAdapter, SignerOutcome } from './types.ts';

export const MOCK_ADAPTER_VERSION = 'mock-adapter/w0-1';

/** Launcher exit codes (contract section 4). Anything else is ADAPTER_ERROR and the call counts as failed. */
export function outcomeFromExitCode(code: unknown): SignerOutcome {
  switch (code) {
    case 0: return 'OK';
    case 1: return 'REFUSED_APPLICATION';
    case 2: return 'USAGE';
    case 3: return 'UNPINNED';
    case 4: return 'INTEGRITY_REFUSED';
    default: return 'ADAPTER_ERROR';
  }
}

export const MOCK_SCENARIOS = ['unpinned', 'integrity-refused', 'refused-application', 'usage', 'timeout', 'adapter-error', 'malformed-output', 'ok'] as const;
export type MockScenario = (typeof MOCK_SCENARIOS)[number];
export const isMockScenario = (x: unknown): x is MockScenario => typeof x === 'string' && (MOCK_SCENARIOS as readonly string[]).includes(x);

interface Script { exit: unknown; text: string; summary?: string }
const SCRIPTS: Readonly<Record<MockScenario, Script>> = {
  'unpinned': { exit: 3, text: 'MOCK: the signer is not pinned to a deployment configuration (scripted refusal).' },
  'integrity-refused': { exit: 4, text: 'MOCK: integrity gate refused (scripted). A real refusal is a security event and is not retried.' },
  'refused-application': { exit: 1, text: 'MOCK: the application refused the operation (scripted).' },
  'usage': { exit: 2, text: 'MOCK: usage error (scripted).' },
  'timeout': { exit: 'timeout', text: 'MOCK: the call timed out (scripted).' },
  'adapter-error': { exit: 99, text: 'MOCK: unexpected exit code (scripted).' },
  'malformed-output': { exit: 'garbage', text: 'MOCK: unparseable output (scripted).' },
  'ok': { exit: 0, text: 'MOCK preview only. Nothing was built, simulated, signed or submitted.', summary: 'MOCK preview summary (not a real simulation).' },
};

export interface MockAdapterDeps {
  scenario: MockScenario;
  audit: AuditStore;
  intents: IntentStore;
  now: () => Date;
  /** Expected baseline hash for the MOCK result field. Server configuration, never browser input. */
  baselineHash: string;
  /** Override for tests (e.g. an all-PASS fixture to prove the overall rule). */
  checks?: Readonly<Record<ReadinessCheckId, { status: CheckStatus; detail: string }>>;
}

export class MockSignerAdapter implements SignerAdapter {
  readonly adapterVersion = MOCK_ADAPTER_VERSION;
  readonly #d: MockAdapterDeps;
  constructor(deps: MockAdapterDeps) { this.#d = deps; }

  async getReadiness(): Promise<ReadinessReport> {
    return evaluateReadiness(this.#d.checks ?? MOCK_CHECKS, this.#d.now().toISOString());
  }

  async requestPreview(request: PreviewRequest): Promise<PreviewResult> {
    const s = SCRIPTS[this.#d.scenario];
    if (s.exit === 'timeout') return { requestId: request.requestId, outcome: 'TIMEOUT', exitCode: -1, redactedOutput: s.text };
    const outcome = outcomeFromExitCode(s.exit);
    const base: PreviewResult = { requestId: request.requestId, outcome, exitCode: typeof s.exit === 'number' ? s.exit : -1, redactedOutput: s.text };
    if (outcome === 'OK') {
      base.baselineHash = this.#d.baselineHash;
      base.summary = `${s.summary ?? ''} operation=${request.operation} digest=${await sha256Hex(`mock-preview:${request.operation}`)}`;
    }
    return base;
  }

  async recordApprovalIntent(intent: OperatorApprovalIntent): Promise<void> {
    this.#d.intents.add(intent); // the console's own store; throws on a reused approvalId
  }

  async listAuditEvents(filter: AuditFilter): Promise<AuditEvent[]> {
    return this.#d.audit.list(filter); // read-only view of the console's audit store
  }
}
