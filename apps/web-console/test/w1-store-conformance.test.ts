// Runs the store conformance suites against the W0 in-memory stores, the only stores that exist. No database has been chosen.
import { InMemoryAuditStore, InMemoryIntentStore, InMemoryPreviewStore } from '../lib/w0/stores.ts';
import { runAuditStoreConformance, runIntentStoreConformance, runPreviewStoreConformance } from './w1-store-conformance.ts';

runAuditStoreConformance('in-memory', () => new InMemoryAuditStore(), (capacity) => new InMemoryAuditStore(capacity));
runIntentStoreConformance('in-memory', () => new InMemoryIntentStore());
runPreviewStoreConformance('in-memory', () => new InMemoryPreviewStore());
