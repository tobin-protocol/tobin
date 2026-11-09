// Pure validation logic shared by the browser page and the node tests. No I/O, no wallet, no network.
(function (root) {
  const MAX_AUTH_LIFETIME_LEDGERS = 10; // Tobin signer-tooling policy (contracts/clearing/signer/mod.rs), NOT a Stellar or contract rule
  const MAX_FEE_STROOPS = 5000000n; // hard budget for this validation (0.5 XLM)
  const STATES = ['FREIGHTER_UNAVAILABLE', 'WALLET_DISCONNECTED', 'WALLET_CONNECTED', 'ACCOUNT_CHANGED', 'WRONG_NETWORK', 'TESTNET_VALIDATED', 'OPERATION_PREPARED', 'SIMULATION_FAILED', 'AWAITING_WALLET_AUTHORIZATION', 'AUTHORIZATION_REJECTED', 'AUTHORIZATION_COLLECTED', 'SUBMISSION_PENDING', 'SUBMISSION_FAILED', 'TRANSACTION_CONFIRMED', 'TRANSACTION_UNCONFIRMED'];

  // Same rule as signer/mod.rs check_expiry: current < expiration <= current + 10, never clamped.
  function checkExpiry(current, expiration) {
    if (!Number.isInteger(current) || current <= 0) return { ok: false, why: 'current ledger missing or invalid (fail closed)' };
    if (!Number.isInteger(expiration) || expiration <= 0) return { ok: false, why: 'expiration must be explicit and positive' };
    if (expiration <= current) return { ok: false, why: `expiration ${expiration} is not after the current ledger ${current}` };
    if (expiration > current + MAX_AUTH_LIFETIME_LEDGERS) return { ok: false, why: `expiration ${expiration} is more than ${MAX_AUTH_LIFETIME_LEDGERS} ledgers after ${current}` };
    return { ok: true };
  }

  // Wallet state from one observation. Never returns a transaction state.
  function walletState(obs, cfg, expectedRoles) {
    if (!obs || !obs.available) return { state: 'FREIGHTER_UNAVAILABLE' };
    if (!obs.address) return { state: 'WALLET_DISCONNECTED' };
    if (obs.networkPassphrase !== cfg.passphrase) return { state: 'WRONG_NETWORK', detail: `wallet network passphrase is ${JSON.stringify(obs.networkPassphrase)}` };
    const role = Object.keys(cfg.accounts).find((k) => cfg.accounts[k] === obs.address);
    if (!role) return { state: 'WALLET_CONNECTED', role: null, detail: 'account is not one of A, B, C, E: signing refused' };
    if (obs.previousAddress && obs.previousAddress !== obs.address) return { state: 'ACCOUNT_CHANGED', role };
    return { state: 'TESTNET_VALIDATED', role };
  }

  // Only SUCCESS from getTransaction is "confirmed". Everything else is NOT confirmed.
  function classifyTx(resp, ageMs, timeoutMs) {
    if (!resp || !resp.status) return { state: 'TRANSACTION_UNCONFIRMED', why: 'no status' };
    if (resp.status === 'SUCCESS') return { state: 'TRANSACTION_CONFIRMED' };
    if (resp.status === 'FAILED') return { state: 'SUBMISSION_FAILED', why: 'FAILED on ledger' };
    if (resp.status === 'NOT_FOUND') return { state: ageMs > timeoutMs ? 'TRANSACTION_UNCONFIRMED' : 'SUBMISSION_PENDING', why: 'NOT_FOUND' };
    return { state: 'TRANSACTION_UNCONFIRMED', why: 'unknown status ' + resp.status };
  }

  function scVal(S, a) {
    if (a.t === 'addr') return new S.Address(a.v).toScVal();
    if (a.t === 'bytes32') {
      if (!/^[0-9a-f]{64}$/.test(a.v)) throw new Error('bad bytes32');
      return S.xdr.ScVal.scvBytes(Uint8Array.from(a.v.match(/../g).map((h) => parseInt(h, 16))));
    }
    if (a.t === 'u32') return S.xdr.ScVal.scvU32(a.v);
    throw new Error('argument type not allowed in W2: ' + a.t);
  }

  function nativeOf(S, v) {
    const n = S.scValToNative(v);
    if (n instanceof Uint8Array) return Array.from(n).map((b) => b.toString(16).padStart(2, '0')).join('');
    return n;
  }
  // SDK 17 object model: credentials.type is 'sorobanCredentialsAddress' (legacy) or 'sorobanCredentialsAddressV2' (CAP-71, what protocol 30 simulation returns).
  const CRED_FIELD = { sorobanCredentialsAddress: 'address', sorobanCredentialsAddressV2: 'addressV2' };
  const addrCreds = (cred) => (CRED_FIELD[cred.type] ? cred[CRED_FIELD[cred.type]] : null);

  // Check every authorization entry against the SDK-built intent. Returns problems (empty = ok).
  function checkEntries(S, entries, intent, passphrase) {
    const problems = [];
    if (intent.network_passphrase !== passphrase) problems.push('intent passphrase differs');
    if (entries.length !== intent.entries.length) problems.push(`entry count ${entries.length} != expected ${intent.entries.length}`);
    const left = intent.entries.map((e) => ({ signer: e.signer, tree: e.tree, used: false }));
    for (const en of entries) {
      const ac = addrCreds(en.credentials);
      if (!ac) { problems.push('credential kind not allowed: ' + en.credentials.type); continue; }
      const addr = S.Address.fromScAddress(ac.address).toString();
      const inv = en.rootInvocation;
      if (inv.function.type !== 'sorobanAuthorizedFunctionTypeContractFn') { problems.push('root invocation is not a contract function'); continue; }
      if (inv.subInvocations.length !== 0) { problems.push('unexpected sub-invocations'); continue; }
      const c = inv.function.contractFn;
      const contract = S.Address.fromScAddress(c.contractAddress).toString();
      const name = c.functionName.toString();
      const args = c.args.map((x) => nativeOf(S, x));
      const m = left.find((l) => !l.used && l.signer === addr && l.tree.contract === contract && l.tree.fn === name && l.tree.subs.length === 0 &&
        l.tree.args.length === args.length && l.tree.args.every((a, i) => String(a.v) === String(args[i])));
      if (!m) problems.push(`entry for ${addr} ${contract.slice(0, 5)}…${name} does not match any expected (signer, tree)`); else m.used = true;
    }
    for (const l of left) if (!l.used) problems.push('expected entry missing for ' + l.signer);
    return problems;
  }

  // Rebuild a transaction with a new auth list (SDK 17 operations are not write-through). No Soroban data: that is added by simulate + assemble.
  function rebuild(S, tx, auth, passphrase) {
    const op0 = tx.operations[0];
    const acct = new S.Account(tx.source, (BigInt(tx.sequence) - 1n).toString());
    return new S.TransactionBuilder(acct, { fee: '1000', networkPassphrase: passphrase, timebounds: { minTime: 0, maxTime: Number(tx.timeBounds.maxTime) } })
      .addOperation(S.Operation.invokeHostFunction({ func: op0.func, auth })).build();
  }
  const isUnsigned = (en) => { const ac = addrCreds(en.credentials); return !!ac && ac.signature.type === 'scvVoid'; };

  const api = { MAX_AUTH_LIFETIME_LEDGERS, MAX_FEE_STROOPS, STATES, checkExpiry, walletState, classifyTx, scVal, checkEntries, addrCreds, rebuild, isUnsigned };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.W2Core = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
