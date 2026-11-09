// The tenant-isolation suite on the SQLite store. The same suite runs on PostgreSQL once it exists (TOBIN_TEST_STORE).
import { harnessFromEnv } from './store-harness.ts';
import { tenantIsolation } from './tenant-isolation.suite.ts';

tenantIsolation(harnessFromEnv());
