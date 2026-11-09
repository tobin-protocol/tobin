// The owner-approved maximum authorization-entry lifetime is 10 ledgers (ADR-0001, BD-07).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ENTRY_LIFETIME_LEDGERS } from '../lib/stellar/run.ts';

test('the authorization-entry lifetime is the approved 10 ledgers', () => { assert.equal(ENTRY_LIFETIME_LEDGERS, 10); });
