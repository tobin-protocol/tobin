// W0 stores. EXPLICITLY NON-PRODUCTION: in memory, lost on restart. The production audit store and the production intent store are unresolved
// decisions (see docs/product/architecture/w0/W0-ARCHITECTURE.md). Both stores are append-only: there is no update or delete method, entries are
// deep-frozen copies, and reads return copies, so a caller cannot alter history through a returned object.
import { redact } from './redact.ts';
import type { AuditEvent, AuditFilter, OperatorApprovalIntent, PreviewResult, Operation } from './types.ts';

export class StoreError extends Error {
  constructor(message: string) { super(message); this.name = 'StoreError'; }
}

const clone = <T>(x: T): T => structuredClone(x);
const freeze = <T extends object>(x: T): Readonly<T> => Object.freeze(x);

export interface AuditStore {
  /** Synchronous by design: the caller must know the event is durable (for this store: stored) before it returns a response. Throws on failure. */
  append(event: AuditEvent): void;
  list(filter: AuditFilter): AuditEvent[];
  get(eventId: string): AuditEvent | undefined;
}

export const DEFAULT_AUDIT_CAPACITY = 10_000;

export class InMemoryAuditStore implements AuditStore {
  readonly #events: Readonly<AuditEvent>[] = [];
  readonly #ids = new Set<string>();
  readonly #capacity: number;
  constructor(capacity: number = DEFAULT_AUDIT_CAPACITY) { this.#capacity = capacity; }

  append(event: AuditEvent): void {
    // A full log refuses new events (and therefore blocks the requests that need them) rather than dropping history or growing without bound.
    if (this.#events.length >= this.#capacity) throw new StoreError('audit capacity reached');
    if (this.#ids.has(event.eventId)) throw new StoreError('duplicate eventId');
    const safe = clone(event);
    if (safe.detail !== undefined) safe.detail = redact(safe.detail);
    if (safe.outcome !== undefined) safe.outcome = redact(safe.outcome);
    this.#events.push(freeze(safe));
    this.#ids.add(safe.eventId);
  }

  list(f: AuditFilter): AuditEvent[] {
    const from = f.from === undefined ? -Infinity : Date.parse(f.from);
    const to = f.to === undefined ? Infinity : Date.parse(f.to);
    return this.#events
      .filter((e) => (f.actor === undefined || e.actor === f.actor)
        && (f.operation === undefined || e.operation === f.operation)
        && (f.type === undefined || e.type === f.type)
        && (f.outcome === undefined || e.outcome === f.outcome)
        && Date.parse(e.timestamp) >= from && Date.parse(e.timestamp) <= to)
      .map(clone);
  }

  get(eventId: string): AuditEvent | undefined {
    const e = this.#events.find((x) => x.eventId === eventId);
    return e === undefined ? undefined : clone(e);
  }
}

/**
 * Two-phase, because the intent store and the audit store cannot be updated atomically:
 *   reserve (id held, nothing visible) -> [audit write] -> commit (intent becomes visible and immutable), or release (reservation dropped, nothing was ever visible).
 * There is deliberately no way to overwrite, edit or delete a COMMITTED intent, and no one-step add.
 */
export interface IntentStore {
  /** Throws StoreError if the id is committed or reserved. */
  reserve(approvalId: string): void;
  /** Throws StoreError unless the id is reserved. Makes the intent visible. */
  commit(intent: OperatorApprovalIntent): void;
  /** Drops a reservation only; a committed intent is never affected. */
  release(approvalId: string): void;
  list(): OperatorApprovalIntent[];
  /** True for committed AND reserved ids. */
  has(approvalId: string): boolean;
  /** The committed intent that references this preview, if any. */
  forPreview(previewRequestId: string): OperatorApprovalIntent | undefined;
}

export class InMemoryIntentStore implements IntentStore {
  readonly #items = new Map<string, Readonly<OperatorApprovalIntent>>();
  readonly #reserved = new Set<string>();
  reserve(approvalId: string): void {
    if (this.#items.has(approvalId) || this.#reserved.has(approvalId)) throw new StoreError('approvalId already used');
    this.#reserved.add(approvalId);
  }
  commit(intent: OperatorApprovalIntent): void {
    if (!this.#reserved.has(intent.approvalId) || this.#items.has(intent.approvalId)) throw new StoreError('approvalId not reserved');
    this.#items.set(intent.approvalId, freeze(clone(intent)));
    this.#reserved.delete(intent.approvalId);
  }
  release(approvalId: string): void { this.#reserved.delete(approvalId); }
  list(): OperatorApprovalIntent[] { return [...this.#items.values()].map(clone); }
  has(approvalId: string): boolean { return this.#items.has(approvalId) || this.#reserved.has(approvalId); }
  forPreview(previewRequestId: string): OperatorApprovalIntent | undefined {
    const i = [...this.#items.values()].find((x) => x.previewRequestId === previewRequestId);
    return i ? clone(i) : undefined;
  }
}

export interface PreviewRecord { requestId: string; operation: Operation; requestedBy: string; requestedAt: string; result: PreviewResult | null; origin: 'mock' }

export class InMemoryPreviewStore {
  readonly #items = new Map<string, PreviewRecord>();
  has(requestId: string): boolean { return this.#items.has(requestId); }
  begin(rec: Omit<PreviewRecord, 'result'>): void {
    if (this.#items.has(rec.requestId)) throw new StoreError('requestId already used');
    this.#items.set(rec.requestId, { ...rec, result: null });
  }
  complete(requestId: string, result: PreviewResult): void {
    const r = this.#items.get(requestId);
    if (!r || r.result !== null) throw new StoreError('preview not pending');
    r.result = clone({ ...result, redactedOutput: redact(result.redactedOutput) });
  }
  list(): PreviewRecord[] { return [...this.#items.values()].map(clone); }
  get(requestId: string): PreviewRecord | undefined { const r = this.#items.get(requestId); return r ? clone(r) : undefined; }
}
