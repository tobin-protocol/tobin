'use strict';
// Writes deployment-config.json for REVIEW: node make-deployment-config.cjs <F public address>
// It takes only a PUBLIC address, generates a random 32-byte salt, computes the predicted contract ID, refuses to overwrite an
// existing file, and prints the SHA-256 that must then be reviewed and placed in pinned.cjs. It never touches any key.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { loadSdk } = require('./sdk-loader.cjs');
const core = require('./tst-signer-core.cjs');

function makeDeploymentConfigText(S, adminAddress, saltHex = crypto.randomBytes(32).toString('hex')) {
  const cfg = core.makeConfig(S, { adminAddress, saltHex });
  return JSON.stringify({ version: 1, network: 'testnet', admin: adminAddress, saltHex, predictedContractId: cfg.tokenId }, null, 2) + '\n';
}

if (require.main === module) {
  try {
    const admin = process.argv[2];
    if (!admin || process.argv.length !== 3) throw new Error('usage: make-deployment-config.cjs <F public address>');
    const S = loadSdk();
    const text = makeDeploymentConfigText(S, admin);
    const file = path.join(__dirname, 'deployment-config.json');
    fs.writeFileSync(file, text, { flag: 'wx', mode: 0o444 });
    console.log('written deployment-config.json (read-only); review it, then pin this SHA-256 in pinned.cjs:');
    console.log(crypto.createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex'));
  } catch (e) { console.error(core.redact(e.message)); process.exit(1); }
}

module.exports = { makeDeploymentConfigText };
