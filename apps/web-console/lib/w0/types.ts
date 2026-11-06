// W0 shared types. Mirrors docs/product/architecture/phase-2c/tst-signer-web-console-integration-contract.md section 4 and 9.
// W0 is a NON-EXECUTING foundation: nothing in lib/w0 starts a process, reads signer files, touches keys or contacts a network.

export const OPERATIONS = ['deploy', 'mint-C', 'mint-D'] as const;
export type Operation = (typeof OPERATIONS)[number];

/** Web roles. `operator` is deliberately absent: it is the local OS account on the signer host, never a web role. */
export const WEB_ROLES = ['viewer', 'requester', 'approver'] as const;
export type Role = (typeof WEB_ROLES)[number];

export const READINESS_CHECK_IDS = [
  'sdk_restored',
  'baseline_matches_approved',
  'approved_baseline_configured',
  'deployment_config_present',
  'deployment_config_pinned',
  'state_present',
  'key_file_present',
  'rpc_reachable',
] as const;
export type ReadinessCheckId = (typeof READINESS_CHECK_IDS)[number];

/** BLOCKED = not evaluable because a prerequisite failed; UNKNOWN = no information. Neither is PASS. */
export type CheckStatus = 'PASS' | 'FAIL' | 'BLOCKED' | 'UNKNOWN';

export interface ReadinessCheck { id: ReadinessCheckId; status: CheckStatus; detail: string }
export interface ReadinessReport {
  generatedAt: string;
  /** W0 never produces anything but BLOCKED unless every check is PASS (contract section 5). */
  overall: 'BLOCKED' | 'READY_FOR_OPERATOR_EXECUTION';
  checks: ReadinessCheck[];
  /** 'mock' in W0. A mock report proves nothing about the real signer. */
  source: 'mock';
}

export interface PreviewRequest { requestId: string; operation: Operation }
export const SIGNER_OUTCOMES = ['OK', 'REFUSED_APPLICATION', 'USAGE', 'UNPINNED', 'INTEGRITY_REFUSED', 'TIMEOUT', 'ADAPTER_ERROR'] as const;
export type SignerOutcome = (typeof SIGNER_OUTCOMES)[number];
export interface PreviewResult {
  requestId: string;
  outcome: SignerOutcome;
  exitCode: number;
  baselineHash?: string;
  summary?: string;
  redactedOutput: string;
}

export interface OperatorApprovalIntent {
  approvalId: string;
  /** W0 addition to the contract's sketch: the specific preview request this intent is evidence for. Immutable once recorded. */
  previewRequestId: string;
  operation: Operation;
  baselineHash: string;
  configSha256: string;
  requestedBy: string;
  approvedBy: string;
  approvedAt: string;
  expiresAt: string;
}

export const AUDIT_EVENT_TYPES = [
  'readiness_checked',
  'preview_requested',
  'preview_completed',
  'approval_intent_recorded',
  'approval_intent_rejected',
  'integrity_refused',
  'adapter_error',
  'auth_denied',
] as const;
export type AuditEventType = (typeof AUDIT_EVENT_TYPES)[number];

export interface AuditEvent {
  eventId: string;
  timestamp: string;
  actor: string;
  role: string;
  requestId: string;
  type: AuditEventType;
  operation?: Operation;
  baselineHash?: string;
  configSha256?: string;
  outcome?: string;
  exitCode?: number;
  adapterVersion: string;
  /** Always 'mock' in W0. Real signer state-file events are never shown. */
  origin: 'mock';
  /** Redacted free-text, only where justified (a rejection reason). */
  detail?: string;
}

export interface AuditFilter {
  actor?: string;
  operation?: Operation;
  type?: AuditEventType;
  outcome?: string;
  from?: string;
  to?: string;
}

/** The only seam to a signer. The W0 implementation is the mock adapter. */
export interface SignerAdapter {
  readonly adapterVersion: string;
  getReadiness(): Promise<ReadinessReport>;
  requestPreview(request: PreviewRequest): Promise<PreviewResult>;
  recordApprovalIntent(intent: OperatorApprovalIntent): Promise<void>;
  listAuditEvents(filter: AuditFilter): Promise<AuditEvent[]>;
}

export interface Principal { subject: string; role: Role }
