'use strict';
// CLI for the restricted TST signer. Commands (nothing else is accepted):
//   node tst-signer.cjs init                 create the local state from the pinned deployment config (no key access, no network)
//   node tst-signer.cjs preview <operation>  build, verify and SIMULATE; never loads the key, never signs
//   node tst-signer.cjs execute <operation>  reconcile, preview, typed confirmation, then sign and submit ONE transaction
// <operation> is one of: deploy, mint-C, mint-D.
// Files:
//   deployment-config.json (next to this script; reviewed and read-only): admin F, salt, predicted contract ID. Its SHA-256 is
//       pinned in pinned.cjs; `execute` is refused while the pin is null or the file differs.
//   <key directory>/settlement-token-admin.dpapi: DPAPI-encrypted secret of F (read only by `execute`, in memory)
//   <key directory>/settlement-token-state.json: the operation record (atomic writes; must match the pinned config exactly)
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { loadSdk } = require('./sdk-loader.cjs');
const core = require('./tst-signer-core.cjs');
const { loadAdminKey } = require('./dpapi-key.cjs');
const { createStore } = require('./state-store.cjs');
const { PINNED_CONFIG_SHA256 } = require('./pinned.cjs');

const KEY_DIR = path.join(process.env.LOCALAPPDATA || '', 'TobinTestKeys');
const STATE_FILE = path.join(KEY_DIR, 'settlement-token-state.json');
const CONFIG_FILE = path.join(__dirname, 'deployment-config.json');
const log = (s) => console.log(core.redact(s));

function makeReader(S, rpc, cfg) {
  return {
    async instanceExists(id) { return (await rpc.getLedgerEntries(new S.Contract(id).getFootprint())).entries.length > 0; },
    async call(id, fn, args = []) {
      const tx = new S.TransactionBuilder(await rpc.getAccount(cfg.F), { fee: '100', networkPassphrase: cfg.passphrase })
        .addOperation(new S.Contract(id).call(fn, ...args.map((a) => new S.Address(a).toScVal()))).setTimeout(30).build();
      const sim = await rpc.simulateTransaction(tx);
      if (sim.error) throw new core.Refusal(`read call ${fn} failed`);
      return S.scValToNative(sim.result.retval);
    },
  };
}

async function main() {
  const [cmd, opName, ...rest] = process.argv.slice(2);
  if (rest.length || !['init', 'preview', 'execute'].includes(cmd) || (cmd !== 'init' && !core.APPROVED.ops.includes(opName)) || (cmd === 'init' && opName)) {
    console.error('usage: tst-signer.cjs init | preview <deploy|mint-C|mint-D> | execute <deploy|mint-C|mint-D>');
    process.exit(2);
  }
  const S = loadSdk();
  let text;
  try { text = fs.readFileSync(CONFIG_FILE, 'utf8'); } catch { throw new core.Refusal('deployment-config.json is missing: F has not been created and reviewed'); }
  const cfg = core.parseDeploymentConfig(S, text, PINNED_CONFIG_SHA256);
  const store = createStore(STATE_FILE);
  if (cmd === 'init') {
    if (!cfg.pinned) throw new core.Refusal('the deployment configuration is not pinned; refusing to create state');
    store.init(cfg);
    log('state created from the pinned deployment configuration (outside any repository)');
    return;
  }
  const rpc = new S.rpc.Server(cfg.rpcUrl);
  const deps = {
    S, rpc, store, reader: makeReader(S, rpc, cfg), log,
    now: () => Math.floor(Date.now() / 1000),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    confirm: (q) => new Promise((res) => { const rl = readline.createInterface({ input: process.stdin, output: process.stdout }); rl.question(q, (a) => { rl.close(); res(a.trim()); }); }),
    loadKey: async (expected) => loadAdminKey(S, expected),
  };
  if (cmd === 'preview') { await core.preview(deps, cfg, opName); return; }
  const record = await core.execute(deps, cfg, opName);
  log(`SUCCESS ${JSON.stringify(record)}`);
}

main().catch((e) => { console.error(core.redact(e && e.message ? e.message : String(e))); process.exit(1); });
