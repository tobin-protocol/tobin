// Demonstration data. NEVER created automatically: it exists only when an operator runs `npm run db:seed-demo` (refused in production) or in unit tests.
// Everything seeded is labelled fixture in its name, and the session record carries provenance 'fixture'.
import { Registry } from './service.ts';
import { InMemoryRegistryStore } from './store.ts';
import type { ActingUser } from './identity.ts';

export const FIXTURE_SESSION_ID = 'f1'.repeat(32);

/** Adds the demo organizations and the fixture session through the normal Registry rules. The users must already exist. */
export function seedDemo(reg: Registry, demo: ActingUser, other: ActingUser): void {
  const org = reg.createOrganization(demo, { name: 'Demo Institution (fixture data)', description: 'Demonstration organization. Everything under it is fixture data.' });
  reg.recordSession(demo, org.id, { sessionId: FIXTURE_SESSION_ID, label: 'Fixture: three-party triangle', fixture: true });
  reg.createOrganization(other, { name: 'Other Institution (fixture data)' });
}

/** In-memory registry with the demo data, for unit tests only (development identities, no database). */
export function seededRegistry(): Registry {
  const reg = new Registry(new InMemoryRegistryStore());
  seedDemo(reg, { userId: 'demo', kind: 'development' }, { userId: 'other', kind: 'development' });
  return reg;
}
