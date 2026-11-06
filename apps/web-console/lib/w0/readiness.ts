// Readiness evaluation. Pure. The overall status is BLOCKED unless EVERY check is PASS (contract section 5; W0 prompt section 5E).
import { READINESS_CHECK_IDS } from './types.ts';
import type { CheckStatus, ReadinessCheck, ReadinessCheckId, ReadinessReport } from './types.ts';

type Table = Readonly<Record<ReadinessCheckId, { status: CheckStatus; detail: string }>>;

/** MOCK readiness data. It mirrors the documented real state (nothing configured) but it is mock: it proves nothing about the real signer. */
export const MOCK_CHECKS: Table = {
  sdk_restored: { status: 'UNKNOWN', detail: 'Not checked: W0 never reads the signer directory.' },
  baseline_matches_approved: { status: 'BLOCKED', detail: 'Blocked: no approved baseline hash is configured on this console.' },
  approved_baseline_configured: { status: 'FAIL', detail: 'No operator-configured approved baseline (out-of-band setting) in W0.' },
  deployment_config_present: { status: 'FAIL', detail: 'Mock: deployment-config.json does not exist (documented Phase 2C state).' },
  deployment_config_pinned: { status: 'FAIL', detail: 'Mock: no pinned configuration hash (documented Phase 2C state).' },
  state_present: { status: 'FAIL', detail: 'Mock: no signer state (documented Phase 2C state).' },
  key_file_present: { status: 'FAIL', detail: 'Mock: no key file (documented Phase 2C state).' },
  rpc_reachable: { status: 'UNKNOWN', detail: 'Not checked: W0 never contacts a network.' },
};

export function evaluateReadiness(table: Table, generatedAt: string): ReadinessReport {
  const checks: ReadinessCheck[] = READINESS_CHECK_IDS.map((id) => {
    const c = table[id];
    // Anything that is not exactly a known status is UNKNOWN: never fabricate a pass.
    const status: CheckStatus = c && (c.status === 'PASS' || c.status === 'FAIL' || c.status === 'BLOCKED') ? c.status : 'UNKNOWN';
    return { id, status, detail: c?.detail ?? 'No information.' };
  });
  const allPass = checks.every((c) => c.status === 'PASS');
  return { generatedAt, overall: allPass ? 'READY_FOR_OPERATOR_EXECUTION' : 'BLOCKED', checks, source: 'mock' };
}
