'use strict';
// LAUNCHER of the restricted TST signer (the only entry point). It is deliberately tiny and loads NO application module until the integrity
// gate has passed: its only imports are the baseline gate (Node built-ins only). The application (SDK loader, signer core, DPAPI key module,
// state store, authorization and refusal modules, pinned.cjs) is required from tst-signer-main.cjs only AFTER verification succeeds.
//
//   node tst-signer.cjs baseline                                              print the candidate baseline (manifest and hash); loads nothing else
//   node tst-signer.cjs preview <op>                                          UNPINNED: print the candidate baseline and stop (exit 3); runs nothing
//   node tst-signer.cjs --approved-baseline <hash> init                       create the local state from the pinned deployment config
//   node tst-signer.cjs --approved-baseline <hash> preview <op>               build, verify and SIMULATE; never loads the key, never signs
//   node tst-signer.cjs --approved-baseline <hash> execute <op>               reconcile, preview, typed confirmation, sign and submit ONE transaction
// <op> is one of: deploy, mint-C, mint-D.
//
// <hash> is the APPROVED baseline: exactly 64 lowercase hexadecimal characters, supplied by the operator on the command line from a record
// kept OUTSIDE the signer directory. It is never read from a file here, from the environment, or from pinned.cjs.
// Exit codes: 0 done; 1 refused or failed by the application; 2 usage or invalid input; 3 unpinned preview (nothing run); 4 integrity refusal.
//
// Trust boundary: this file and baseline.cjs cannot be verified by themselves. They are covered by the external tool
// (scripts/tst-signer-verify/verify-signer-baseline.cjs) run from a trusted copy; see tst-signer-security-architecture.md.
const baseline = require('./baseline.cjs');

const USAGE = 'usage: tst-signer.cjs baseline | preview <deploy|mint-C|mint-D> | [--approved-baseline <64 lowercase hex>] init | preview <deploy|mint-C|mint-D> | execute <deploy|mint-C|mint-D>';
const OPS = ['deploy', 'mint-C', 'mint-D'];
const out = (s) => process.stdout.write(s + '\n');
const err = (s) => process.stderr.write(s + '\n');

function parse(argv) {
  let approved; let rest = argv;
  if (argv[0] === '--approved-baseline') { if (argv.length < 2) return null; approved = argv[1]; rest = argv.slice(2); }
  const [cmd, op, ...extra] = rest;
  if (extra.length || !['baseline', 'init', 'preview', 'execute'].includes(cmd)) return null;
  if ((cmd === 'preview' || cmd === 'execute') && !OPS.includes(op)) return null;
  if ((cmd === 'init' || cmd === 'baseline') && op !== undefined) return null;
  return { approved, cmd, op, args: rest };
}

function showCandidate(c) {
  out(c.manifest.trimEnd());
  out('');
  out(`candidate baseline: ${c.hash}`);
}

function launch() {
  const p = parse(process.argv.slice(2));
  if (!p) { err(USAGE); process.exit(2); }
  let verified;
  try {
    baseline.checkProcessEnvironment();
    if (p.cmd === 'baseline' || (p.cmd === 'preview' && p.approved === undefined)) {
      const c = baseline.computeManifest({ signerDir: __dirname });
      showCandidate(c);
      if (p.cmd === 'baseline') process.exit(0);
      err('UNPINNED: preview was not run. Supply the approved baseline with --approved-baseline <hash> to run it.');
      process.exit(3);
    }
    if (p.approved === undefined) { err('this command requires --approved-baseline <64 lowercase hex>'); process.exit(2); }
    verified = baseline.verifyApproved({ signerDir: __dirname, approved: p.approved });
  } catch (e) {
    if (e instanceof baseline.IntegrityError) {
      err(`REFUSED: ${e.message}`);
      process.exit(e.code === 'BAD_INPUT' ? 2 : 4);
    }
    err(`REFUSED: integrity check failed: ${e && e.message ? e.message : String(e)}`);   // fail closed on anything unexpected
    process.exit(4);
  }
  // Only now are application modules loaded, and the application receives the proof that this gate produced.
  require('./tst-signer-main.cjs').run(p.args, verified);
}

launch();
