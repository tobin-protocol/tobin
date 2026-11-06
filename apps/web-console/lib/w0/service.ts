// Application service: authorisation, validation, audit and the adapter, in the order the contract requires. This is the layer where permissions
// are ENFORCED (the UI hides controls only for convenience). It never starts a process and never reaches anything but the injected SignerAdapter.
import { can } from './rbac.ts';
import type { Permission } from './rbac.ts';
import { redact } from './redact.ts';
import type { AuditStore, InMemoryPreviewStore, IntentStore, PreviewRecord } from './stores.ts';
import { outcomeFromExitCode } from './mock-adapter.ts';
import { ValidationError, isHash, parseApprovalIntent, parseAuditFilter, parsePreviewRequest, parseIsoTime } from './validate.ts';
import { SIGNER_OUTCOMES } from './types.ts';
import type { AuditEvent, AuditEventType, AuditFilter, Operation, OperatorApprovalIntent, Principal, PreviewResult, ReadinessReport, SignerAdapter, SignerOutcome } from './types.ts';

export type ServiceErrorCode = 'unauthenticated' | 'forbidden' | 'invalid' | 'conflict' | 'not_found' | 'audit_unavailable' | 'rate_limited' | 'internal';
const STATUS: Record<ServiceErrorCode, number> = { unauthenticated: 401, forbidden: 403, invalid: 400, conflict: 409, not_found: 404, audit_unavailable: 503, rate_limited: 429, internal: 500 };

export class ServiceError extends Error {
  readonly code: ServiceErrorCode;
  readonly status: number;
  constructor(code: ServiceErrorCode, message: string) { super(message); this.name = 'ServiceError'; this.code = code; this.status = STATUS[code]; }
}

export interface ExpectedValues {
  /** Server configuration only. Never taken from a request. In W0 these are clearly-labelled MOCK values (see deps.ts). */
  baselineHash: string;
  configSha256: string;
}
export interface ServiceDeps {
  adapter: SignerAdapter;
  audit: AuditStore;
  intents: IntentStore;
  previews: InMemoryPreviewStore;
  now: () => Date;
  newId: () => string;
  expected: ExpectedValues;
}

export const MAX_INTENT_LIFETIME_MS = 24 * 3_600_000; // W0 engineering choice (documented), not a founder decision
export const MAX_CLOCK_SKEW_MS = 5 * 60_000;

export class ConsoleService {
  readonly #d: ServiceDeps;
  constructor(deps: ServiceDeps) { this.#d = deps; }

  #audit(actor: string, role: string, requestId: string, type: AuditEventType, extra: Partial<AuditEvent> = {}): void {
    const e: AuditEvent = { eventId: this.#d.newId(), timestamp: this.#d.now().toISOString(), actor, role, requestId, type, adapterVersion: this.#d.adapter.adapterVersion, origin: 'mock', ...extra };
    try { this.#d.audit.append(e); } catch { throw new ServiceError('audit_unavailable', 'audit log unavailable; the request was not processed'); }
  }
  #auditBestEffort(actor: string, role: string, requestId: string, type: AuditEventType, extra: Partial<AuditEvent> = {}): void {
    try { this.#audit(actor, role, requestId, type, extra); } catch { /* a refusal stays a refusal even if it cannot be logged */ }
  }

  #authorize(p: Principal, perm: Permission, requestId: string): void {
    if (!can(p.role, perm)) {
      this.#auditBestEffort(p.subject, String(p.role), requestId, 'auth_denied', { detail: `permission ${perm} denied` });
      throw new ServiceError('forbidden', 'not permitted');
    }
  }

  /** Called by the HTTP layer for requests that carry no valid session. */
  unauthenticated(requestId: string, reason: string): ServiceError {
    this.#auditBestEffort('anonymous', 'none', requestId, 'auth_denied', { detail: redact(reason) });
    return new ServiceError('unauthenticated', 'authentication required');
  }

  async getReadiness(p: Principal): Promise<ReadinessReport> {
    const requestId = this.#d.newId();
    this.#authorize(p, 'read_readiness', requestId);
    this.#audit(p.subject, p.role, requestId, 'readiness_checked');
    const r = await this.#d.adapter.getReadiness();
    return { ...r, source: 'mock' };
  }

  async requestPreview(p: Principal, raw: unknown): Promise<PreviewRecord> {
    this.#authorize(p, 'request_preview', this.#d.newId());
    let req;
    try { req = parsePreviewRequest(raw); } catch (e) { throw invalid(e); }
    if (this.#d.previews.has(req.requestId)) throw new ServiceError('conflict', 'requestId already used');

    // Audit BEFORE the adapter is reached; an unwritable log blocks the call.
    this.#audit(p.subject, p.role, req.requestId, 'preview_requested', { operation: req.operation });
    try { this.#d.previews.begin({ requestId: req.requestId, operation: req.operation, requestedBy: p.subject, requestedAt: this.#d.now().toISOString(), origin: 'mock' }); }
    catch { throw new ServiceError('conflict', 'requestId already used'); }

    let result: PreviewResult;
    try { result = this.#normalise(req.requestId, await this.#d.adapter.requestPreview(req)); }
    catch { result = { requestId: req.requestId, outcome: 'ADAPTER_ERROR', exitCode: -1, redactedOutput: 'The adapter failed.' }; }

    const common: Partial<AuditEvent> = { operation: req.operation, outcome: result.outcome, exitCode: result.exitCode, ...(result.baselineHash ? { baselineHash: result.baselineHash } : {}) };
    // No retry of any outcome; an integrity refusal additionally becomes a security event.
    this.#audit(p.subject, p.role, req.requestId, 'preview_completed', common);
    if (result.outcome === 'INTEGRITY_REFUSED') this.#audit(p.subject, p.role, req.requestId, 'integrity_refused', common);
    if (result.outcome === 'ADAPTER_ERROR' || result.outcome === 'TIMEOUT') this.#audit(p.subject, p.role, req.requestId, 'adapter_error', common);

    this.#d.previews.complete(req.requestId, result);
    return this.#d.previews.get(req.requestId) as PreviewRecord;
  }

  /** Fail closed on anything unexpected: wrong shape, unknown outcome, exit code that does not match the outcome, mismatched requestId. */
  #normalise(requestId: string, r: unknown): PreviewResult {
    const bad: PreviewResult = { requestId, outcome: 'ADAPTER_ERROR', exitCode: -1, redactedOutput: 'The adapter returned an unusable result; treated as failed.' };
    if (typeof r !== 'object' || r === null) return bad;
    const o = r as Record<string, unknown>;
    if (o['requestId'] !== requestId || typeof o['redactedOutput'] !== 'string' || typeof o['exitCode'] !== 'number' || !Number.isInteger(o['exitCode'])) return bad;
    const outcome = o['outcome'];
    if (typeof outcome !== 'string' || !(SIGNER_OUTCOMES as readonly string[]).includes(outcome)) return bad;
    const oc = outcome as SignerOutcome;
    if (oc !== 'TIMEOUT' && oc !== 'ADAPTER_ERROR' && outcomeFromExitCode(o['exitCode']) !== oc) return bad;
    const out: PreviewResult = { requestId, outcome: oc, exitCode: o['exitCode'], redactedOutput: redact(o['redactedOutput']) };
    if (oc === 'OK') {
      if (isHash(o['baselineHash'])) out.baselineHash = o['baselineHash'];
      if (typeof o['summary'] === 'string') out.summary = redact(o['summary']);
    }
    return out;
  }

  async recordApprovalIntent(p: Principal, raw: unknown): Promise<OperatorApprovalIntent> {
    this.#authorize(p, 'record_approval_intent', this.#d.newId());
    const reject: (requestId: string, detail: string, code?: ServiceErrorCode, extra?: Partial<AuditEvent>) => never = (requestId, detail, code = 'invalid', extra = {}) => {
      this.#auditBestEffort(p.subject, p.role, requestId, 'approval_intent_rejected', { detail, ...extra });
      throw new ServiceError(code, detail);
    };
    let intent: OperatorApprovalIntent;
    try { intent = parseApprovalIntent(raw); } catch { return reject(this.#d.newId(), 'malformed approval intent'); }
    const rid = intent.approvalId;
    const ctx: Partial<AuditEvent> = { operation: intent.operation };

    if (intent.approvedBy !== p.subject) reject(rid, 'approvedBy must be the authenticated approver', 'forbidden', ctx);
    if (intent.requestedBy === intent.approvedBy) reject(rid, 'requester and approver must differ', 'forbidden', ctx);
    if (intent.baselineHash !== this.#d.expected.baselineHash) reject(rid, 'baseline hash does not match the current baseline', 'invalid', ctx);
    if (intent.configSha256 !== this.#d.expected.configSha256) reject(rid, 'configuration hash does not match the current configuration', 'invalid', ctx);

    const now = this.#d.now().getTime();
    const approvedAt = parseIsoTime(intent.approvedAt, 'approvedAt');
    const expiresAt = parseIsoTime(intent.expiresAt, 'expiresAt');
    if (Math.abs(now - approvedAt) > MAX_CLOCK_SKEW_MS) reject(rid, 'approvedAt is not current', 'invalid', ctx);
    if (expiresAt <= now) reject(rid, 'approval intent has expired', 'invalid', ctx);
    if (expiresAt <= approvedAt) reject(rid, 'expiresAt must be after approvedAt', 'invalid', ctx);
    if (expiresAt - approvedAt > MAX_INTENT_LIFETIME_MS) reject(rid, 'approval intent lifetime too long', 'invalid', ctx);

    // The intent is evidence about ONE specific preview: it must exist, be the requester's, be for this operation, have completed with OK, and
    // report the same baseline hash. A failed, refused, pending or unusable preview is never evidence that an operation is ready.
    const preview = this.#d.previews.get(intent.previewRequestId);
    if (!preview) reject(rid, 'referenced preview request does not exist', 'invalid', ctx);
    if (preview.requestedBy !== intent.requestedBy) reject(rid, 'preview was requested by a different identity', 'invalid', ctx);
    if (preview.operation !== intent.operation) reject(rid, 'preview is for a different operation', 'invalid', ctx);
    if (!preview.result) reject(rid, 'preview has no completed result', 'invalid', ctx);
    if (preview.result.outcome !== 'OK') reject(rid, `preview did not complete successfully (${preview.result.outcome})`, 'invalid', ctx);
    if (preview.result.baselineHash !== intent.baselineHash) reject(rid, 'baseline hash differs from the one the preview reported', 'invalid', ctx);
    if (this.#d.intents.forPreview(preview.requestId)) reject(rid, 'an approval intent already exists for this preview', 'conflict', ctx);

    // Reserve -> audit -> commit. The stores cannot be updated atomically, so the sequence is arranged so that history stays truthful:
    //  * audit fails            -> reservation released, nothing stored, nothing logged as recorded, request fails closed;
    //  * commit fails (defensive; a reserved id cannot normally fail) -> the already written event is followed by an explicit
    //    approval_intent_rejected event marked as a partial failure, the reservation is released, and the request fails.
    try { this.#d.intents.reserve(rid); } catch { reject(rid, 'approvalId already used', 'conflict', ctx); }
    try { this.#audit(p.subject, p.role, rid, 'approval_intent_recorded', { ...ctx, baselineHash: intent.baselineHash, configSha256: intent.configSha256 }); }
    catch (e) { this.#d.intents.release(rid); throw e; }
    try { await this.#d.adapter.recordApprovalIntent(intent); }
    catch {
      this.#d.intents.release(rid);
      reject(rid, 'PARTIAL FAILURE: approval_intent_recorded was logged but the intent was NOT stored', 'internal', ctx);
    }
    return intent;
  }

  listPreviews(p: Principal): PreviewRecord[] { this.#authorize(p, 'read_previews', this.#d.newId()); return this.#d.previews.list(); }
  listIntents(p: Principal): OperatorApprovalIntent[] { this.#authorize(p, 'read_intents', this.#d.newId()); return this.#d.intents.list(); }

  async listAuditEvents(p: Principal, rawFilter: unknown): Promise<AuditEvent[]> {
    this.#authorize(p, 'read_audit', this.#d.newId());
    let f: AuditFilter;
    try { f = parseAuditFilter(rawFilter ?? {}); } catch (e) { throw invalid(e); }
    return this.#d.adapter.listAuditEvents(f);
  }
}

function invalid(e: unknown): ServiceError {
  return new ServiceError('invalid', e instanceof ValidationError ? e.message : 'invalid request');
}

export type { Operation };
