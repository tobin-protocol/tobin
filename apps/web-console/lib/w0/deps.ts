// Process-wide wiring for the W0 console. MOCK ONLY: the adapter is the mock, the stores are in memory, the identity provider is the
// development provider. All values here are server configuration; none comes from a request.
import { configuredPort } from '../server/guards.ts';
import { DevelopmentIdentityProvider, SessionStore } from './identity.ts';
import { isMockScenario, MockSignerAdapter } from './mock-adapter.ts';
import { ConsoleService } from './service.ts';
import { InMemoryAuditStore, InMemoryIntentStore, InMemoryPreviewStore } from './stores.ts';
import { RateLimiter } from './http.ts';
import type { HttpDeps } from './http.ts';

// sha256 of the strings below. They are deliberately NOT the approved B1 hash, the B0 hashes or any real configuration hash (a test recomputes them).
export const MOCK_BASELINE_HASH = 'f51bd13862564f896c27ff8fd105649558eb768018bdb4a94186789a44f49588'; // sha256("TOBIN-W0-MOCK-BASELINE")
export const MOCK_CONFIG_SHA256 = '7c73d9b423cb08e53964226257b1b2f7ad6343fdbec2a9cba67bd33639f5f30b'; // sha256("TOBIN-W0-MOCK-CONFIG")

/** Environment variables set by common hosting platforms. If any is present the process is treated as hosted and the development identity provider is refused. */
export const HOSTED_ENV_MARKERS = [
  'VERCEL', 'VERCEL_ENV', 'VERCEL_URL', 'NOW_REGION', 'NETLIFY', 'RENDER', 'RENDER_SERVICE_ID', 'FLY_APP_NAME', 'RAILWAY_ENVIRONMENT', 'DYNO',
  'K_SERVICE', 'AWS_EXECUTION_ENV', 'AWS_LAMBDA_FUNCTION_NAME', 'ECS_CONTAINER_METADATA_URI', 'WEBSITE_SITE_NAME', 'KUBERNETES_SERVICE_HOST', 'CF_PAGES',
] as const;

export interface DevIdpDecision { allowed: boolean; reason: string }

/**
 * The development identity provider is a LOCAL convenience, never an authentication system.
 *  - hosted environment marker present  -> refused, whatever else is set (W0_ALLOW_DEV_IDP cannot override this);
 *  - NODE_ENV=production                -> refused unless W0_ALLOW_DEV_IDP=1 (a local production-build run on loopback);
 *  - otherwise (next dev, tests)        -> allowed.
 * Independently of this decision, proxy.ts accepts only Host 127.0.0.1:PORT / localhost:PORT, so a remotely reachable deployment cannot be driven.
 */
export function decideDevIdp(env: Record<string, string | undefined>): DevIdpDecision {
  const marker = HOSTED_ENV_MARKERS.find((k) => (env[k] ?? '') !== '');
  if (marker) return { allowed: false, reason: `refused: hosted environment detected (${marker}); no production identity provider is approved` };
  if (env['NODE_ENV'] === 'production' && env['W0_ALLOW_DEV_IDP'] !== '1') return { allowed: false, reason: 'refused: production mode and no approved identity provider (W0_ALLOW_DEV_IDP=1 is for local loopback runs only)' };
  return { allowed: true, reason: 'development identity provider (local only, not authentication)' };
}

export function buildDeps(env: Record<string, string | undefined>, now: () => number = Date.now): HttpDeps {
  const scenarioEnv = env['W0_MOCK_SCENARIO'];
  const scenario = isMockScenario(scenarioEnv) ? scenarioEnv : 'unpinned';
  const audit = new InMemoryAuditStore();
  const intents = new InMemoryIntentStore();
  const previews = new InMemoryPreviewStore();
  const clock = () => new Date(now());
  const adapter = new MockSignerAdapter({ scenario, audit, intents, now: clock, baselineHash: MOCK_BASELINE_HASH });
  const service = new ConsoleService({ adapter, audit, intents, previews, now: clock, newId: () => crypto.randomUUID(), expected: { baselineHash: MOCK_BASELINE_HASH, configSha256: MOCK_CONFIG_SHA256 } });
  const decision = decideDevIdp(env);
  return {
    service,
    idp: decision.allowed ? new DevelopmentIdentityProvider() : null,
    idpNote: decision.reason,
    sessions: new SessionStore(now),
    port: configuredPort(env),
    now,
    newId: () => crypto.randomUUID(),
    // Secure cookies in every production build. Only a development server (plain HTTP on loopback) gets non-Secure cookies.
    secureCookies: env['NODE_ENV'] === 'production',
    limiter: new RateLimiter(60, 60_000),
    loginLimiter: new RateLimiter(20, 60_000),
    anonLimiter: new RateLimiter(30, 60_000),
  };
}

const KEY = Symbol.for('tobin.w0.deps');
export function defaultDeps(): HttpDeps {
  const g = globalThis as unknown as Record<symbol, HttpDeps | undefined>;
  return (g[KEY] ??= buildDeps(process.env));
}
