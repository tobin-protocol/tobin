// Regression tests for the release-gate source-tree scan (G09) and its single exception: the schema-validated Stellar Testnet deployment
// manifest. Run with: node --test scripts/release/scan.test.mjs
// Test identifiers are built at run time (not written out) so that this file does not itself look like a contract ID or a secret seed.
import assert from 'node:assert/strict';
import test from 'node:test';
import { EVIDENCE_CONTRACT_ID_EXCEPTIONS, MANIFEST_CONTRACT_IDS, manifestProblems, scanFile, TESTNET_MANIFEST_PATH } from './scan.mjs';

const contractId = (c) => 'C' + c.repeat(55);
const accountId = (c) => 'G' + c.repeat(55);
const secretSeed = () => 'S' + 'A'.repeat(55);
const hash = (c) => c.repeat(64);

const valid = () => ({
  network: 'testnet',
  rpc: 'https://soroban-testnet.stellar.org',
  networkPassphrase: 'Test SDF Network ; September 2015',
  gitCommit: 'abcdef1',
  recordedAt: '2026-10-29T23:00Z',
  note: 'Experimental MVP-1 test deployment. Public identifiers only.',
  deployer: accountId('A'),
  contracts: {
    tobin_test_token: { contractId: contractId('B'), wasmHash: hash('a'), deployTx: hash('b'), initialization: 'constructor' },
    tobin_clearing_v1: { contractId: contractId('C'), wasmHash: hash('c'), deployTx: hash('d'), initialization: 'none' },
  },
  functionalChecks: { mintTx: hash('e'), createSessionTx: hash('f'), sessionId: hash('1') },
});
const text = (o) => JSON.stringify(o, null, 2);

test('a valid Testnet deployment manifest is accepted at its path', () => {
  assert.deepEqual(manifestProblems(text(valid())), []);
  assert.deepEqual(scanFile(TESTNET_MANIFEST_PATH, text(valid())), []);
});

test('the same manifest anywhere else is still flagged', () => {
  const f = scanFile('contracts/deployments/other.json', text(valid()));
  assert.equal(f.length, 1);
  assert.match(f[0], /contract-id-shaped string outside test fixtures/);
  assert.equal(scanFile('docs/deployment.md', text(valid())).length, 1);
});

test('a contract-ID-shaped string in an ordinary source file remains flagged', () => {
  const src = `const TOKEN = "${contractId('D')}";`;
  for (const f of ['contracts/clearing/src/lib.rs', 'apps/landing/src/lib/site.ts', 'README.md', 'contracts/clearing/tests/lifecycle.rs']) {
    assert.match(scanFile(f, src).join('\n'), /contract-id-shaped string outside test fixtures/, f);
  }
});

test('the existing fixture directories still hold synthetic identifiers without a finding', () => {
  assert.deepEqual(scanFile('contracts/clearing/tests/fixtures/deployment.TEST-ONLY.json', `{"clearing":"${contractId('E')}"}`), []);
});

test('a missing or wrong network declaration is rejected', () => {
  const noNetwork = valid();
  delete noNetwork.network;
  const wrong = { ...valid(), network: 'futurenet' };
  const noPassphrase = valid();
  delete noPassphrase.networkPassphrase;
  for (const m of [noNetwork, wrong, noPassphrase]) {
    assert.notDeepEqual(manifestProblems(text(m)), []);
    assert.match(scanFile(TESTNET_MANIFEST_PATH, text(m)).join('\n'), /invalid Testnet deployment manifest/);
  }
});

test('a Mainnet deployment manifest is not accepted by the exception', () => {
  const mainnet = {
    ...valid(),
    network: 'mainnet',
    rpc: 'https://mainnet.example.org',
    networkPassphrase: 'Public Global Stellar Network ; September 2015',
  };
  assert.notDeepEqual(manifestProblems(text(mainnet)), []);
  assert.match(scanFile(TESTNET_MANIFEST_PATH, text(mainnet)).join('\n'), /invalid Testnet deployment manifest/);
  // Mainnet wording smuggled into an otherwise valid Testnet manifest is rejected too.
  assert.notDeepEqual(manifestProblems(text({ ...valid(), note: 'also deployed to mainnet' })), []);
});

test('the manifest must match the schema exactly: unknown keys, bad formats and non-JSON are rejected', () => {
  assert.notDeepEqual(manifestProblems(text({ ...valid(), extra: 'x' })), []);
  const badId = valid();
  badId.contracts.tobin_test_token.contractId = 'not-a-contract-id';
  assert.notDeepEqual(manifestProblems(text(badId)), []);
  const badHash = valid();
  badHash.contracts.tobin_clearing_v1.wasmHash = 'abc';
  assert.notDeepEqual(manifestProblems(text(badHash)), []);
  const wrongRpc = { ...valid(), rpc: 'https://soroban-testnet.stellar.org.evil.example' };
  assert.notDeepEqual(manifestProblems(text(wrongRpc)), []);
  assert.deepEqual(manifestProblems('{ not json'), ['not valid JSON']);
  assert.match(scanFile(TESTNET_MANIFEST_PATH, '{ not json ' + contractId('F')).join('\n'), /invalid Testnet deployment manifest/);
});

test('the other detections still apply, including inside the manifest', () => {
  assert.match(scanFile('src/a.ts', `key = "${secretSeed()}"`).join('\n'), /secret-seed-shaped/);
  assert.match(scanFile(TESTNET_MANIFEST_PATH, text({ ...valid(), note: secretSeed() })).join('\n'), /secret-seed-shaped/);
  assert.match(scanFile('x.pem', '').join('\n'), /excluded or unsuitable path/);
  assert.match(scanFile('.env.local', '').join('\n'), /excluded or unsuitable path/);
  assert.match(scanFile('notes.md', '-----BEGIN ' + 'PRIVATE KEY-----').join('\n'), /private key block/);
  assert.match(scanFile('notes.md', 'C:' + String.fromCharCode(92) + 'Users' + String.fromCharCode(92) + 'x').join('\n'), /absolute local user path/);
  assert.match(scanFile(TESTNET_MANIFEST_PATH, text({ ...valid(), note: '/ho' + 'me/alice/keys' })).join('\n'), /absolute local user path/);
  assert.deepEqual(scanFile('docs/ok.md', 'plain text'), []);
});

// ---- the evidence exception: exactly two MVP-1.5 evidence files, only for contract ids that the deployment manifest records ----
const EVIDENCE = 'docs/product/architecture/mvp-1.5/evidence/simulation-oneunit-2026-11-07.json';
const EVIDENCE_2 = 'docs/product/architecture/mvp-1.5/evidence/multisig-live-audit-2026-11-07.json';
const known = new Set([contractId('B'), contractId('C')]);
const evidenceText = (extra = {}) => JSON.stringify({ clearing: contractId('C'), token: contractId('B'), ...extra });

test('the exception is exactly the two accepted evidence files and nothing broader', () => {
  assert.deepEqual([...EVIDENCE_CONTRACT_ID_EXCEPTIONS].sort(), [EVIDENCE_2, EVIDENCE].sort());
  assert.ok(Object.isFrozen(EVIDENCE_CONTRACT_ID_EXCEPTIONS));
  assert.ok(EVIDENCE_CONTRACT_ID_EXCEPTIONS.every((p) => p.endsWith('.json') && !/[*?]/.test(p)), 'no glob and no directory');
});
test('the real manifest ids are what the real evidence files use (the exception is tied to the manifest, not to a copy)', async () => {
  const { readFileSync } = await import('node:fs');
  const real = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
  assert.ok(MANIFEST_CONTRACT_IDS.size >= 2);
  for (const p of EVIDENCE_CONTRACT_ID_EXCEPTIONS) assert.deepEqual(scanFile(p, real(p)), [], p);
});
test('an excepted evidence file with only manifest ids is accepted', () => {
  assert.deepEqual(scanFile(EVIDENCE, evidenceText(), known), []);
  assert.deepEqual(scanFile(EVIDENCE_2, evidenceText(), known), []);
});
test('an excepted evidence file with a contract id the manifest does not record is still a finding', () => {
  const f = scanFile(EVIDENCE, evidenceText({ other: contractId('D') }), known);
  assert.equal(f.length, 1); assert.match(f[0], /not recorded in the deployment manifest/);
});
test('the same evidence content anywhere else is still a finding: a sibling file, another directory, a prefix, a different case', () => {
  for (const p of ['docs/product/architecture/mvp-1.5/evidence/other.json', 'docs/product/architecture/mvp-1.5/evidence/simulation-oneunit-2026-11-07.json.bak',
    'docs/product/architecture/mvp-1.4/evidence/simulation-oneunit-2026-11-07.json', 'evidence/simulation-oneunit-2026-11-07.json',
    'docs/product/architecture/mvp-1.5/evidence/Simulation-oneunit-2026-11-07.json', 'docs/product/architecture/mvp-1.5/MVP-1.5-TESTNET-VERIFICATION.md']) {
    const f = scanFile(p, evidenceText(), known);
    assert.equal(f.length, 1, p); assert.match(f[0], /contract-id-shaped string outside test fixtures/);
  }
});
test('an excepted file must stay valid JSON', () => {
  const f = scanFile(EVIDENCE, 'not json ' + contractId('C'), known);
  assert.ok(f.some((x) => /not valid JSON/.test(x)));
});
test('real secrets, private keys, local paths and excluded paths still fail inside an excepted file', () => {
  assert.ok(scanFile(EVIDENCE, evidenceText({ s: secretSeed() }), known).some((x) => /secret-seed-shaped/.test(x)));
  assert.ok(scanFile(EVIDENCE, evidenceText({ k: '-----BEGIN ' + 'PRIVATE KEY-----' }), known).some((x) => /private key block/.test(x)));
  assert.ok(scanFile(EVIDENCE, evidenceText({ p: '/c/' + 'Users/someone/project' }), known).some((x) => /absolute local user path/.test(x)));
  assert.ok(scanFile('docs/product/architecture/mvp-1.5/evidence/.env', evidenceText(), known).some((x) => /excluded or unsuitable path/.test(x)));
});
test('the exception does not change the other rules: a seed in an ordinary file and a contract id in an ordinary file still fail', () => {
  assert.equal(scanFile('docs/notes.md', 'x ' + secretSeed()).length, 1);
  assert.equal(scanFile('docs/notes.md', 'x ' + contractId('C'), known).length, 1);
  assert.equal(scanFile('apps/web-console/lib/x.ts', 'const a = "' + contractId('B') + '";', known).length, 1);
});
