(async function () {
  const S = StellarSdk, F = freighterApi, C = W2Core;
  const $ = (id) => document.getElementById(id);
  const cfg = await (await fetch('/api/config')).json();
  const server = new S.rpc.Server(location.origin + '/api/rpc', { allowHttp: true });
  let state = 'FREIGHTER_UNAVAILABLE', wallet = { address: null }, prev = null, prepared = null;
  const rpc = async (method, params) => { const r = await fetch('/api/rpc', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) }); const j = await r.json(); if (!r.ok) throw new Error(j.error || r.status); return j.result; };
  const ledger = async () => (await rpc('getLatestLedger', {})).sequence;
  const ev = (o) => fetch('/api/evidence', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(o) }).catch(() => {});
  const log = (m) => { $('log').textContent += new Date().toISOString() + ' ' + m + '\n'; };
  const setState = (s, d) => { state = s; $('state').textContent = s; $('state').className = /FAIL|REJECT|WRONG|UNAVAIL|UNCONF|DISCONN/.test(s) ? 'bad' : 'ok'; log('STATE ' + s + (d ? ' (' + d + ')' : '')); ev({ kind: 'state', state: s, detail: d }); };
  const relayGet = async () => (await (await fetch('/api/relay')).json());
  const relayPut = (v) => fetch('/api/relay', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(v) });

  async function refresh() {
    let obs = { available: false };
    try {
      const c = await F.isConnected();
      if (c && c.isConnected) {
        const a = await F.getAddress(); const n = await F.getNetworkDetails();
        obs = { available: true, address: a && a.address ? a.address : null, networkPassphrase: n && n.networkPassphrase, previousAddress: prev };
        wallet = { address: obs.address };
        if (obs.address) prev = obs.address;
      }
    } catch (e) { obs = { available: false }; log('freighter error: ' + e.message); }
    const w = C.walletState(obs, cfg);
    wallet.role = w.role || null;
    $('wallet').textContent = JSON.stringify({ ...obs, role: wallet.role, versions: { freighterApi: '6.0.1', stellarSdk: '17.4.0' }, ua: navigator.userAgent }, null, 1);
    setState(w.state, w.detail);
    return w;
  }
  $('connect').onclick = async () => { try { await F.requestAccess(); } catch (e) { log('requestAccess: ' + e.message); } await refresh(); };
  try { new F.WatchWalletChanges(2000).watch(() => refresh()); } catch (e) { log('watch unavailable: ' + e.message); }
  await refresh();

  const ready = (roles) => { if (state !== 'TESTNET_VALIDATED' && state !== 'AUTHORIZATION_COLLECTED' && state !== 'OPERATION_PREPARED' && state !== 'ACCOUNT_CHANGED') { log('REFUSED: wallet state is ' + state); return false; } if (!wallet.role || !roles.includes(wallet.role)) { log('REFUSED: connected account role ' + wallet.role + ' not in ' + roles.join('/')); return false; } return true; };

  $('prepare').onclick = async () => {
    try {
      if (!ready(['E', 'A', 'B', 'C'])) return;
      const op = $('op').value;
      const p = await (await fetch('/api/prepare', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op }) })).json();
      if (p.error) throw new Error(p.error);
      const acct = await server.getAccount(cfg.accounts.E);
      const tx = new S.TransactionBuilder(acct, { fee: '1000', networkPassphrase: cfg.passphrase, timebounds: { minTime: 0, maxTime: Math.floor(Date.now() / 1000) + 300 } })
        .addOperation(S.Operation.invokeContractFunction({ contract: p.call.contract, function: p.call.fn, args: p.call.args.map((a) => C.scVal(S, a)) })).build();
      const L0 = await ledger();
      const sim = await server.simulateTransaction(tx);
      if (S.rpc.Api.isSimulationError(sim)) { setState('SIMULATION_FAILED', sim.error); $('review').textContent = 'SIMULATION FAILED: ' + sim.error; ev({ kind: 'sim', op, ledger: L0, error: sim.error }); return; }
      const auth = sim.result.auth;
      const problems = C.checkEntries(S, auth, p.intent, cfg.passphrase);
      const assembled = S.rpc.assembleTransaction(tx, sim).build();
      const fee = BigInt(assembled.fee);
      if (fee > C.MAX_FEE_STROOPS) problems.push('fee ' + fee + ' exceeds budget');
      if (problems.length) { setState('SIMULATION_FAILED', problems.join('; ')); $('review').textContent = 'REFUSED:\n' + problems.join('\n'); return; }
      prepared = { op, txXdr: C.rebuild(S, tx, auth, cfg.passphrase).toXDR(), preparedAtLedger: L0, fee: fee.toString(), minResourceFee: sim.minResourceFee, intent: p.intent };
      await relayPut(prepared);
      setState('OPERATION_PREPARED');
      $('review').textContent = JSON.stringify({ network: cfg.passphrase, source: 'E ' + cfg.accounts.E, contract: p.call.contract, fn: p.call.fn, args: p.call.args, requiredSigners: p.call.auths.map((a) => a.signer + ' : ' + a.purpose), simulatedAtLedger: L0, minResourceFee: sim.minResourceFee, assembledFeeStroops: prepared.fee, credentialTypes: auth.map((a) => a.credentials.type), entryExpirations: auth.map((a) => C.addrCreds(a.credentials).signatureExpirationLedger), costs: sim.cost }, null, 1);
      ev({ kind: 'prepared', op, ledger: L0, fee: prepared.fee, minResourceFee: sim.minResourceFee, entries: auth.length });
    } catch (e) { setState('SIMULATION_FAILED', e.message); }
  };

  const authOf = (tx) => tx.operations[0].auth;

  $('sign').onclick = async () => {
    try {
      const w = await refresh();
      if (!ready(['A', 'B', 'C'])) return;
      prepared = await relayGet(); if (prepared.empty) { log('nothing prepared'); return; }
      const tx = new S.Transaction(prepared.txXdr, cfg.passphrase);
      const entries = authOf(tx); const out = [];
      let mine = 0;
      for (const en of entries) {
        const addr = S.Address.fromScAddress(C.addrCreds(en.credentials).address).toString();
        if (addr !== wallet.address || !C.isUnsigned(en)) { out.push(en); continue; }
        const now = await ledger(); const life = Math.min(10, Math.max(1, Number($('life').value)));
        const exp = now + life; const chk = C.checkExpiry(now, exp);
        if (!chk.ok) { setState('AUTHORIZATION_REJECTED', 'signer-tooling policy refused: ' + chk.why); return; }
        setState('AWAITING_WALLET_AUTHORIZATION', 'signing for ' + wallet.role + ' with expiry ledger ' + exp + ' at ledger ' + now);
        const t0 = Date.now();
        let signed;
        try {
          signed = await S.authorizeEntry(en, async (preimage, payload) => {
            const r = await F.signAuthEntry(preimage.toXDR('base64'), { networkPassphrase: cfg.passphrase, address: wallet.address });
            if (r.error || !r.signedAuthEntry) throw new Error('wallet: ' + JSON.stringify(r.error || 'no signature'));
            const after = await F.getAddress();
            if (!after || after.address !== wallet.address) throw new Error('account changed during authorization: result discarded');
            ev({ kind: 'raw-sign-result', keys: Object.keys(r), signedLen: r.signedAuthEntry.length, signerAddress: r.signerAddress, preimageLen: preimage.toXDR('base64').length });
            if (r.signerAddress && r.signerAddress !== wallet.address) throw new Error('wallet signed with a different account: ' + r.signerAddress);
            const sig = Uint8Array.from(atob(r.signedAuthEntry), (ch) => ch.charCodeAt(0));
            if (!S.Keypair.fromPublicKey(wallet.address).verify(payload, sig)) throw new Error('returned signature does not verify over sha256(preimage); length ' + sig.length);
            return sig;
          }, exp, cfg.passphrase);
        } catch (e) {
          setState('AUTHORIZATION_REJECTED', e.message); ev({ kind: 'sign-fail', role: wallet.role, message: e.message, ms: Date.now() - t0 }); return;
        }
        const after = await ledger();
        ev({ kind: 'signed', role: wallet.role, address: wallet.address, preparedAtLedger: prepared.preparedAtLedger, assignedAtLedger: now, expiration: exp, signedAtLedger: after, ms: Date.now() - t0 });
        log(`signed ${wallet.role}: assigned@${now} exp=${exp} signed@${after} (${Date.now() - t0} ms)`);
        out.push(signed); mine++;
      }
      if (!mine) { log('no unsigned entry for this account'); return; }
      const next = C.rebuild(S, tx, out, cfg.passphrase);
      prepared.txXdr = next.toXDR();
      await relayPut(prepared);
      const remaining = authOf(next).filter(C.isUnsigned).length;
      setState(remaining ? 'OPERATION_PREPARED' : 'AUTHORIZATION_COLLECTED', remaining + ' entries still unsigned');
    } catch (e) { setState('AUTHORIZATION_REJECTED', e.message); }
  };

  $('finalize').onclick = async () => {
    try {
      prepared = await relayGet(); if (prepared.empty) return;
      const tx = new S.Transaction(prepared.txXdr, cfg.passphrase);
      const L = await ledger();
      const exps = authOf(tx).map((e) => C.addrCreds(e.credentials).signatureExpirationLedger);
      if (authOf(tx).some(C.isUnsigned)) { setState('SIMULATION_FAILED', 'unsigned entries remain'); return; }
      const dead = exps.filter((x) => x <= L);
      if (dead.length) { setState('SIMULATION_FAILED', 'authorization expired before enforcing simulation: expirations ' + exps + ' at ledger ' + L); ev({ kind: 'expired-before-finalize', exps, ledger: L }); return; }
      const sim = await server.simulateTransaction(tx);
      if (S.rpc.Api.isSimulationError(sim)) { setState('SIMULATION_FAILED', sim.error); ev({ kind: 'enforcing-sim-fail', error: sim.error, ledger: L }); return; }
      const final = S.rpc.assembleTransaction(tx, sim).build();
      if (BigInt(final.fee) > C.MAX_FEE_STROOPS) { setState('SIMULATION_FAILED', 'fee over budget'); return; }
      prepared.txXdr = final.toXDR(); prepared.fee = final.fee; prepared.finalizedAtLedger = L;
      await relayPut(prepared);
      setState('AUTHORIZATION_COLLECTED', 'enforcing simulation succeeded at ledger ' + L + ', fee ' + final.fee);
      ev({ kind: 'enforcing-sim-ok', ledger: L, fee: final.fee, exps });
    } catch (e) { setState('SIMULATION_FAILED', e.message); }
  };

  $('envsign').onclick = async () => {
    try {
      await refresh(); if (!ready(['E'])) return;
      prepared = await relayGet(); if (prepared.empty) return;
      setState('AWAITING_WALLET_AUTHORIZATION', 'envelope signature by E');
      const r = await F.signTransaction(prepared.txXdr, { networkPassphrase: cfg.passphrase, address: cfg.accounts.E });
      if (r.error || !r.signedTxXdr) { setState('AUTHORIZATION_REJECTED', JSON.stringify(r.error)); return; }
      prepared.signedXdr = r.signedTxXdr; await relayPut(prepared);
      setState('AUTHORIZATION_COLLECTED', 'envelope signed; NOT submitted');
    } catch (e) { setState('AUTHORIZATION_REJECTED', e.message); }
  };

  $('submit').onclick = async () => {
    try {
      prepared = await relayGet(); if (prepared.empty || !prepared.signedXdr) { log('no signed envelope'); return; }
      if (!cfg.submitEnabled) { setState('SUBMISSION_FAILED', 'submission is disabled in this process (no owner authorization)'); return; }
      setState('SUBMISSION_PENDING');
      const r = await rpc('sendTransaction', { transaction: prepared.signedXdr });
      ev({ kind: 'send', status: r.status, hash: r.hash, errorResult: r.errorResultXdr });
      if (r.status === 'ERROR' || r.status === 'TRY_AGAIN_LATER') { setState('SUBMISSION_FAILED', r.status); return; }
      prepared.hash = r.hash; await relayPut(prepared);
      log('accepted for processing, hash ' + r.hash + ' (NOT confirmed)');
    } catch (e) { setState('SUBMISSION_FAILED', e.message); }
  };

  // Read-only: simulate get_session(S) and decode. Never signs, never submits. Shows RPC data only.
  $('read').onclick = async () => {
    try {
      const p = await (await fetch('/api/prepare', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'read_session' }) })).json();
      if (p.error) throw new Error(p.error);
      const acct = await server.getAccount(cfg.accounts.E);
      const tx = new S.TransactionBuilder(acct, { fee: '1000', networkPassphrase: cfg.passphrase, timebounds: { minTime: 0, maxTime: Math.floor(Date.now() / 1000) + 60 } })
        .addOperation(S.Operation.invokeContractFunction({ contract: p.call.contract, function: p.call.fn, args: p.call.args.map((a) => C.scVal(S, a)) })).build();
      const L = await ledger();
      const sim = await server.simulateTransaction(tx);
      if (S.rpc.Api.isSimulationError(sim)) { $('review').textContent = 'READ (RPC) at ledger ' + L + ': ' + sim.error.split('\n')[0]; ev({ kind: 'read', ledger: L, error: sim.error.split('\n')[0] }); return; }
      const v = JSON.parse(JSON.stringify(S.scValToNative(sim.result.retval), (k, x) => typeof x === 'bigint' ? x.toString() : x));
      $('review').textContent = 'READ (RPC, not a fixture) at ledger ' + L + ':\n' + JSON.stringify(v, null, 1);
      ev({ kind: 'read', ledger: L, session: v });
    } catch (e) { $('review').textContent = 'READ FAILED (no data): ' + e.message; }
  };

  $('poll').onclick = async () => {
    try {
      prepared = await relayGet(); if (!prepared.hash) { log('no hash'); return; }
      const t0 = Date.now(); let res = null;
      while (Date.now() - t0 < 60000) {
        try { res = await rpc('getTransaction', { hash: prepared.hash }); } catch (e) { log('rpc error: ' + e.message); }
        const c = C.classifyTx(res, Date.now() - t0, 60000);
        if (res && res.status !== 'NOT_FOUND') { setState(c.state, c.why); ev({ kind: 'tx', hash: prepared.hash, status: res.status, ledger: res.ledger }); break; }
        await new Promise((r) => setTimeout(r, 2000));
      }
      if (!res || res.status === 'NOT_FOUND') setState('TRANSACTION_UNCONFIRMED', 'not found after 60 s (not a failure and not a success)');
    } catch (e) { setState('TRANSACTION_UNCONFIRMED', e.message); }
  };
})();
