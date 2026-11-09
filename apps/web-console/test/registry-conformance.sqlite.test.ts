// The registry conformance suite on the SQLite store (the store used today). The same suite runs on PostgreSQL once it exists (TOBIN_TEST_STORE).
import { harnessFromEnv } from './store-harness.ts';
import { registryConformance } from './registry-conformance.suite.ts';

registryConformance(harnessFromEnv());
