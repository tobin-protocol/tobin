// Strict, closed-shape validators. Every function returns a value or throws ValidationError; unknown keys are rejected, never ignored.
import { OPERATIONS, AUDIT_EVENT_TYPES } from './types.ts';
import type { AuditEventType, AuditFilter, Operation, OperatorApprovalIntent, PreviewRequest } from './types.ts';

export class ValidationError extends Error {
  constructor(message: string) { super(message); this.name = 'ValidationError'; }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const HASH = /^[0-9a-f]{64}$/;
const SUBJECT = /^[A-Za-z0-9._@-]{1,64}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const FREE = /^[A-Za-z0-9_-]{1,64}$/;

function record(v: unknown, what: string, allowed: readonly string[]): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v) || Object.getPrototypeOf(v) !== Object.prototype) throw new ValidationError(`${what} must be a JSON object`);
  for (const k of Object.keys(v)) if (!allowed.includes(k)) throw new ValidationError(`${what}: unexpected field`);
  return v as Record<string, unknown>;
}
function str(o: Record<string, unknown>, k: string, re: RegExp): string {
  const x = o[k];
  if (typeof x !== 'string' || !re.test(x)) throw new ValidationError(`invalid ${k}`);
  return x;
}

export const isOperation = (x: unknown): x is Operation => typeof x === 'string' && (OPERATIONS as readonly string[]).includes(x);
export function parseOperation(x: unknown): Operation {
  if (!isOperation(x)) throw new ValidationError('operation must be one of deploy, mint-C, mint-D');
  return x;
}
export function parseIsoTime(x: unknown, k: string): number {
  if (typeof x !== 'string' || !ISO.test(x)) throw new ValidationError(`invalid ${k}`);
  const t = Date.parse(x);
  if (!Number.isFinite(t)) throw new ValidationError(`invalid ${k}`);
  return t;
}
export const isHash = (x: unknown): x is string => typeof x === 'string' && HASH.test(x);
export const isUuid = (x: unknown): x is string => typeof x === 'string' && UUID.test(x);

export function parsePreviewRequest(v: unknown): PreviewRequest {
  const o = record(v, 'preview request', ['requestId', 'operation']);
  return { requestId: str(o, 'requestId', UUID), operation: parseOperation(o['operation']) };
}

export function parseApprovalIntent(v: unknown): OperatorApprovalIntent {
  const o = record(v, 'approval intent', ['approvalId', 'operation', 'baselineHash', 'configSha256', 'requestedBy', 'approvedBy', 'approvedAt', 'expiresAt']);
  const intent: OperatorApprovalIntent = {
    approvalId: str(o, 'approvalId', UUID),
    operation: parseOperation(o['operation']),
    baselineHash: str(o, 'baselineHash', HASH),
    configSha256: str(o, 'configSha256', HASH),
    requestedBy: str(o, 'requestedBy', SUBJECT),
    approvedBy: str(o, 'approvedBy', SUBJECT),
    approvedAt: str(o, 'approvedAt', ISO),
    expiresAt: str(o, 'expiresAt', ISO),
  };
  parseIsoTime(intent.approvedAt, 'approvedAt');
  parseIsoTime(intent.expiresAt, 'expiresAt');
  return intent;
}

export function parseAuditFilter(v: unknown): AuditFilter {
  const o = record(v, 'audit filter', ['actor', 'operation', 'type', 'outcome', 'from', 'to']);
  const f: AuditFilter = {};
  if (o['actor'] !== undefined) f.actor = str(o, 'actor', SUBJECT);
  if (o['operation'] !== undefined) f.operation = parseOperation(o['operation']);
  if (o['type'] !== undefined) {
    const t = o['type'];
    if (typeof t !== 'string' || !(AUDIT_EVENT_TYPES as readonly string[]).includes(t)) throw new ValidationError('invalid type');
    f.type = t as AuditEventType;
  }
  if (o['outcome'] !== undefined) f.outcome = str(o, 'outcome', FREE);
  if (o['from'] !== undefined) { parseIsoTime(o['from'], 'from'); f.from = o['from'] as string; }
  if (o['to'] !== undefined) { parseIsoTime(o['to'], 'to'); f.to = o['to'] as string; }
  return f;
}
