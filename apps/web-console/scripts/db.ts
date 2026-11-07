// Operator commands for the application database. Usage (from apps/web-console):
//   node scripts/db.ts migrate        apply pending migrations (idempotent)
//   node scripts/db.ts status         show the schema version and pending migrations
//   node scripts/db.ts seed-demo      create the labelled FIXTURE demo organizations and users (REFUSED when NODE_ENV=production; needs TOBIN_DEMO_PASSWORD)
// The database file is TOBIN_DB_PATH (required in production; defaults to .data/tobin-dev.sqlite otherwise).
import { migrationStatus, migrate, openDatabase } from '../lib/db/database.ts';
import { readBackendConfig } from '../lib/server/backend.ts';
import { AuthService } from '../lib/auth/service.ts';
import { Registry } from '../lib/registry/service.ts';
import { SqliteRegistryStore } from '../lib/registry/sqlite-store.ts';
import { seedDemo } from '../lib/registry/demo-seed.ts';

const cmd = process.argv[2];
const cfg = readBackendConfig(process.env);
const db = openDatabase(cfg.dbPath);
try {
  if (cmd === 'migrate') {
    const st = migrate(db);
    console.log(`schema version ${st.current} of ${st.latest}; applied: ${st.applied.map((a) => a.version).join(', ') || 'none'}`);
  } else if (cmd === 'status') {
    const st = migrationStatus(db);
    console.log(JSON.stringify({ current: st.current, latest: st.latest, pending: st.pending }));
    process.exitCode = st.pending.length ? 2 : 0;
  } else if (cmd === 'seed-demo') {
    if (process.env['NODE_ENV'] === 'production') throw new Error('seed-demo is refused in production: fixture data must never enter a production database');
    const password = process.env['TOBIN_DEMO_PASSWORD'];
    if (!password) throw new Error('set TOBIN_DEMO_PASSWORD (12 to 128 characters) for the demo accounts; no default password exists');
    migrate(db);
    const auth = new AuthService(db);
    const reg = new Registry(new SqliteRegistryStore(db));
    const demo = await auth.register({ email: 'demo@example.test', password, displayName: 'Demo User' });
    const other = await auth.register({ email: 'other@example.test', password, displayName: 'Other User' });
    seedDemo(reg, demo, other);
    console.log('demo data created: demo@example.test and other@example.test (labelled fixture)');
  } else {
    console.error('usage: node scripts/db.ts migrate | status | seed-demo');
    process.exitCode = 64;
  }
} catch (e) {
  console.error(`error: ${(e as Error).message}`);
  process.exitCode = 1;
} finally { db.close(); }
