// Canonical asset identity (tobin-asset/v1): strict serialization, network separation, issuer distinction. Pure; no database, no network.
import assert from 'node:assert/strict';
import test from 'node:test';
import { encodeAddress } from 'tobin-mvp1-sdk/strkey';
import { AssetIdentityError, ASSET_SCHEMA, codeOf, formatAsset, parseAsset, sameAsset, validateAsset } from '../lib/registry/asset-identity.ts';

const ISS1 = encodeAddress('account', new Uint8Array(32).fill(1)); // valid strkeys, test fixtures only
const ISS2 = encodeAddress('account', new Uint8Array(32).fill(2));
const TOKEN = encodeAddress('contract', new Uint8Array(32).fill(3));
const bad = (f: () => unknown) => assert.throws(f, AssetIdentityError);

test('schema name and the three identity forms', () => {
  assert.equal(ASSET_SCHEMA, 'tobin-asset/v1');
  assert.equal(formatAsset({ network: 'testnet', kind: 'native' }), 'testnet:native');
  assert.equal(formatAsset({ network: 'public', kind: 'native' }), 'public:native');
  assert.equal(formatAsset({ network: 'testnet', kind: 'issued', code: 'USD', issuer: ISS1 }), `testnet:USD:${ISS1}`);
  assert.equal(formatAsset({ network: 'testnet', kind: 'contract', contractId: TOKEN }), `testnet:contract:${TOKEN}`);
  assert.equal(codeOf({ network: 'testnet', kind: 'native' }), 'XLM'); assert.equal(codeOf({ network: 'testnet', kind: 'issued', code: 'USD', issuer: ISS1 }), 'USD');
  assert.equal(codeOf({ network: 'testnet', kind: 'contract', contractId: TOKEN }), undefined, 'a contract token has no intrinsic code');
});

test('serialization round-trips exactly', () => {
  for (const a of [{ network: 'testnet', kind: 'native' }, { network: 'public', kind: 'issued', code: 'EURC', issuer: ISS2 }, { network: 'testnet', kind: 'contract', contractId: TOKEN }] as const) {
    assert.deepEqual(parseAsset(formatAsset(a)), a); assert.equal(formatAsset(parseAsset(formatAsset(a))), formatAsset(a));
  }
});

test('the same code from two issuers, or on two networks, is two different assets', () => {
  const a = `testnet:USD:${ISS1}`, b = `testnet:USD:${ISS2}`, c = `public:USD:${ISS1}`;
  assert.ok(!sameAsset(a, b), 'issuer distinguishes'); assert.ok(!sameAsset(a, c), 'network distinguishes'); assert.ok(sameAsset(a, a));
  assert.notEqual(formatAsset(parseAsset('testnet:native')), formatAsset(parseAsset('public:native')), 'Testnet XLM is not Mainnet XLM');
});

test('strictness: anything that is not exactly a canonical identifier is rejected', () => {
  for (const s of ['', 'USD', 'native', 'testnet', 'testnet:', ':native', 'testnet:native:', 'testnet:native:x', `testnet:usd:${ISS1}`, `testnet:USD:${ISS1} `, ` testnet:USD:${ISS1}`, `mainnet:USD:${ISS1}`, `testnet:TOOLONGASSET123:${ISS1}`, `testnet:USD:${ISS1.slice(0, 55)}`, `testnet:USD:${ISS1.slice(0, 55)}A`, `testnet:USD:${TOKEN}`, `testnet:contract:${ISS1}`, 'testnet:contract:CABC', `testnet:USD:${ISS1}:extra`, `TESTNET:native`, 'testnet:NATIVE']) bad(() => parseAsset(s));
  for (const v of [undefined, null, 5, {}, [], 'x'.repeat(300)]) bad(() => parseAsset(v));
});

test('validateAsset: untrusted objects are checked and cleaned; extra fields are refused', () => {
  assert.deepEqual(validateAsset({ network: 'testnet', kind: 'issued', code: 'USD', issuer: ISS1 }), { network: 'testnet', kind: 'issued', code: 'USD', issuer: ISS1 });
  bad(() => validateAsset({ network: 'testnet', kind: 'native', code: 'XLM' })); bad(() => validateAsset({ network: 'testnet', kind: 'issued', code: 'USD' }));
  bad(() => validateAsset({ network: 'testnet', kind: 'issued', code: 'USD', issuer: ISS1, contractId: TOKEN })); bad(() => validateAsset({ network: 'devnet', kind: 'native' }));
  bad(() => validateAsset({ network: 'testnet', kind: 'issued', code: 'usd', issuer: ISS1 })); bad(() => validateAsset({ network: 'testnet', kind: 'issued', code: 'USD', issuer: 'G' + 'A'.repeat(55) }));
  bad(() => validateAsset(null)); bad(() => validateAsset({ network: 'testnet', kind: 'bond' }));
});
