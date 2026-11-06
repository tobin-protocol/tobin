'use strict';
// Loads the pinned Stellar SDK browser bundle (a scratch download, NOT installed in any repository) after verifying
// its package version and the SHA-256 of the exact file. Refuses to load anything else.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');

const EXPECTED_NAME = '@stellar/stellar-sdk';
const EXPECTED_VERSION = '17.4.0';
const EXPECTED_BUNDLE_SHA256 = 'de18071d1f64bf6aa1806a4eb250b3be7c1811a8e8ecdfc3c103013cf1d9b92f';
const DEFAULT_PACKAGE_DIR = path.join(
  __dirname, '..', 'pk', 'x-stellar-stellar-sdk-17.4.0', 'package'
);

function loadSdk(packageDir = DEFAULT_PACKAGE_DIR) {
  const pkg = JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8'));
  if (pkg.name !== EXPECTED_NAME || pkg.version !== EXPECTED_VERSION) {
    throw new Error(`SDK package mismatch: expected ${EXPECTED_NAME}@${EXPECTED_VERSION}`);
  }
  const bundle = fs.readFileSync(path.join(packageDir, 'dist', 'stellar-sdk.js'));
  const sha = crypto.createHash('sha256').update(bundle).digest('hex');
  if (sha !== EXPECTED_BUNDLE_SHA256) throw new Error('SDK bundle hash mismatch: refusing to load');
  globalThis.self = globalThis;
  vm.runInThisContext(bundle.toString('utf8'));
  if (!globalThis.StellarSdk) throw new Error('SDK bundle did not initialise');
  return globalThis.StellarSdk;
}

module.exports = { loadSdk, EXPECTED_VERSION, EXPECTED_BUNDLE_SHA256 };
