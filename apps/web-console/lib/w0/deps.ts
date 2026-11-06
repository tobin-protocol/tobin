// Process-wide wiring for the W0 console. MOCK ONLY: the adapter is the mock, the stores are in memory, the identity provider is the
// development provider. All values here are server configuration; none comes from a request.
import { configuredPort } from '../server/guards.ts';
import { DevelopmentIdentityProvider, SessionStore } from './identity.ts';
import { isMockScenario, MockSignerAdapter } from './mock-adapter.ts';
import { ConsoleService } from './service.ts';
import { InMemoryAuditStore, InMemoryIntentStore, InMemoryPreviewStore } from './stores.ts';
import { RateLimiter } from './http.ts';
import type { HttpDeps } from './http.ts';

// sha256 of the strings below. They are deliberately NOT the approved B1 hash or any real configuration hash (a test recomputes them).
export const MOCK_BASELINE_HASH = 'f51bd13862564f896c27ff8fd105649558eb768018bdb4a94186789a44f49588'; // sha256("TOBIN-W0-MOCK-BASELINE")
export const MOCK_CONFIG_SHA256 = '7c73d9b423cb08e53964226257b1b2f7ad6343fdbec2a9cba67bd33639f5f30b'; // sha256("TOBIN-W0-MOCK-CONFIG")

export function buildDeps(env: Record<string, string | undefined>, now: () => number = Date.now): HttpDeps {
  const scenarioEnv = env['W0_MOCK_SCENARIO'];
  const scenario = isMockScenario(scenarioEnv) ? scenarioEnv : 'unpinned';
  const audit = new InMemoryAuditStore();
  const intents = new InMemoryIntentStore();
  const previews = new InMemoryPreviewStore();
  const clock = () => new Date(now());
  const adapter = new MockSignerAdapter({ scenario, audit, intents, now: clock, baselineHash: MOCK_BASELINE_HASH });
  const service = new ConsoleService({ adapter, audit, intents, previews, now: clock, newId: () => crypto.randomUUID(), expected: { baselineHash: MOCK_BASELINE_HASH, configSha256: MOCK_CONFIG_SHA256 } });
  // The development identity provider is on in `next dev`; in a production build it must be switched on explicitly, and is still labelled DEVELOPMENT.
  const devIdp = env['NODE_ENV'] !== 'production' || env['W0_ALLOW_DEV_IDP'] === '1';
  return { service, idp: devIdp ? new DevelopmentIdentityProvider() : null, sessions: new SessionStore(now), port: configuredPort(env), now, newId: () => crypto.randomUUID(), limiter: new RateLimiter(60, 60_000), loginLimiter: new RateLimiter(20, 60_000) };
}

const KEY = Symbol.for('tobin.w0.deps');
export function defaultDeps(): HttpDeps {
  const g = globalThis as unknown as Record<symbol, HttpDeps | undefined>;
  return (g[KEY] ??= buildDeps(process.env));
}
