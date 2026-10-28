//! Shared helpers for the host tests of TobinClearingV1 and TobinTestToken (local only: the Soroban test host, native contracts).
//!
//! Authorization is supplied with `mock_auths` and explicit per-invocation `MockAuth` trees, NOT with `mock_all_auths`: the host still
//! matches every `require_auth` / `require_auth_for_args` against the stated invocation tree. `mock_auths` registers an accept-anything
//! account at each signer, so nothing here shows that a wallet can sign; `tests/signed.rs` adds real ed25519 signatures.
#![allow(dead_code)]

use ed25519_dalek::SigningKey;
use soroban_sdk::{
    testutils::{EnvTestConfig, MockAuth, MockAuthInvoke},
    xdr::{self, ToXdr},
    Address, Bytes, BytesN, Env, IntoVal, String as SStr, TryFromVal, Val, Vec,
};
use std::rc::Rc;
use tobin_clearing_v1::{Error, Instruction, Obligation, TobinClearingV1, TobinClearingV1Client};
use tobin_test_token::{TobinTestToken, TobinTestTokenClient};

pub const CAP: i128 = 1_000_000;

pub struct Acct {
    pub key: SigningKey,
    pub id: xdr::AccountId,
    pub addr: Address,
}

pub struct World {
    pub env: Env,
    pub clearing: Address,
    pub token: Address,
    pub minter: Acct,
    pub a: Acct,
    pub b: Acct,
    pub c: Acct,
    pub d: Acct,
    pub x: Acct, // an outsider: never admitted
}

#[derive(Debug, PartialEq)]
pub enum Out {
    Ok,
    Contract(Error),
    /// a host error (authorization, crypto, token contract error, ...): the codes seen in the diagnostic events
    Host(std::string::String),
}

impl Out {
    pub fn is_host_auth(&self) -> bool {
        matches!(self, Out::Host(s) if s.contains("Auth"))
    }
}

/// A generated (contract-kind) test address: usable with `mock_auths` (which needs a contract-kind signer). The key is unused.
pub fn acct(env: &Env, seed: u8) -> Acct {
    use soroban_sdk::testutils::Address as _;
    let key = SigningKey::from_bytes(&[seed; 32]);
    let id = xdr::AccountId(xdr::PublicKey::PublicKeyTypeEd25519(xdr::Uint256(
        key.verifying_key().to_bytes(),
    )));
    Acct {
        key,
        id,
        addr: Address::generate(env),
    }
}

/// A classic account with a ledger entry (so real signatures can be verified) and a known key.
pub fn real_acct(env: &Env, seed: u8) -> Acct {
    let key = SigningKey::from_bytes(&[seed; 32]);
    let id = xdr::AccountId(xdr::PublicKey::PublicKeyTypeEd25519(xdr::Uint256(
        key.verifying_key().to_bytes(),
    )));
    let entry_key = Rc::new(xdr::LedgerKey::Account(xdr::LedgerKeyAccount {
        account_id: id.clone(),
    }));
    let entry = Rc::new(xdr::LedgerEntry {
        last_modified_ledger_seq: 0,
        data: xdr::LedgerEntryData::Account(xdr::AccountEntry {
            account_id: id.clone(),
            balance: 0,
            seq_num: xdr::SequenceNumber(0),
            num_sub_entries: 1,
            inflation_dest: None,
            flags: 0,
            home_domain: Default::default(),
            thresholds: xdr::Thresholds([1, 1, 1, 1]),
            signers: xdr::VecM::default(),
            ext: xdr::AccountEntryExt::V0,
        }),
        ext: xdr::LedgerEntryExt::V0,
    });
    env.host()
        .add_ledger_entry(&entry_key, &entry, None)
        .unwrap();
    let addr = Address::try_from_val(env, &xdr::ScAddress::Account(id.clone())).unwrap();
    Acct { key, id, addr }
}

pub fn new_env() -> Env {
    Env::new_with_config(EnvTestConfig {
        capture_snapshot_at_drop: false,
    })
}

pub fn world_with_cap(cap: i128) -> World {
    build_world(cap, acct)
}

/// A world whose participants are classic accounts with ledger entries and known keys (for real signatures, `tests/signed.rs`).
pub fn world_real() -> World {
    build_world(CAP, real_acct)
}

fn build_world(cap: i128, mk: fn(&Env, u8) -> Acct) -> World {
    let env = new_env();
    let minter = mk(&env, 90);
    // Native by default; the compiled Wasm artifacts when TOBIN_TOKEN_WASM / TOBIN_CLEARING_WASM name files, so the same tests run against
    // the real artifacts (built with `stellar contract build`).
    let args = (
        minter.addr.clone(),
        cap,
        7u32,
        SStr::from_str(&env, "Tobin Test Token"),
        SStr::from_str(&env, "TTT"),
    );
    let token = match std::env::var("TOBIN_TOKEN_WASM") {
        Ok(p) => env.register(
            std::fs::read(&p)
                .expect("TOBIN_TOKEN_WASM is not readable")
                .as_slice(),
            args,
        ),
        Err(_) => env.register(TobinTestToken, args),
    };
    let clearing = match std::env::var("TOBIN_CLEARING_WASM") {
        Ok(p) => env.register(
            std::fs::read(&p)
                .expect("TOBIN_CLEARING_WASM is not readable")
                .as_slice(),
            (),
        ),
        Err(_) => env.register(TobinClearingV1, ()),
    };
    World {
        a: mk(&env, 11),
        b: mk(&env, 12),
        c: mk(&env, 13),
        d: mk(&env, 14),
        x: mk(&env, 15),
        minter,
        token,
        clearing,
        env,
    }
}

pub fn world() -> World {
    world_with_cap(CAP)
}

pub fn clearing(w: &World) -> TobinClearingV1Client<'_> {
    TobinClearingV1Client::new(&w.env, &w.clearing)
}

pub fn token(w: &World) -> TobinTestTokenClient<'_> {
    TobinTestTokenClient::new(&w.env, &w.token)
}

pub fn bal(w: &World, who: &Acct) -> i128 {
    token(w).balance(&who.addr)
}

pub fn sid(w: &World, n: u8) -> BytesN<32> {
    BytesN::from_array(&w.env, &[n; 32])
}

pub fn oid(w: &World, n: u8) -> BytesN<32> {
    BytesN::from_array(&w.env, &[n; 32])
}

/// Mint with the minter's explicit authorization of exactly (to, amount).
pub fn mint(w: &World, to: &Acct, amount: i128) {
    let inv = MockAuthInvoke {
        contract: &w.token,
        fn_name: "mint",
        args: (&to.addr, &amount).into_val(&w.env),
        sub_invokes: &[],
    };
    let auths = [MockAuth {
        address: &w.minter.addr,
        invoke: &inv,
    }];
    token(w).mock_auths(&auths).mint(&to.addr, &amount);
}

pub fn classify<T: std::fmt::Debug, C: std::fmt::Debug, I: std::fmt::Debug>(
    env: &Env,
    r: Result<Result<T, C>, Result<Error, I>>,
) -> Out {
    match r {
        Ok(Ok(_)) => Out::Ok,
        Ok(Err(e)) => panic!("conversion error {e:?}"),
        Err(Ok(e)) => Out::Contract(e),
        Err(Err(_)) => {
            let mut codes: std::vec::Vec<std::string::String> = std::vec::Vec::new();
            for ev in env.host().get_diagnostic_events().unwrap().0.iter() {
                let s = format!("{ev}");
                if let Some(i) = s.find("topics:[error, Error(") {
                    if let Some(j) = s[i + 15..].find(')') {
                        let c = s[i + 15..=i + 15 + j].to_string();
                        if !codes.contains(&c) {
                            codes.push(c);
                        }
                    }
                }
            }
            Out::Host(format!("{codes:?}"))
        }
    }
}

pub fn must(o: Out) {
    assert_eq!(o, Out::Ok);
}

/// Run `f` with the given signers each authorizing the plain call `fname(args)` (the call's own arguments, `require_auth()`).
fn run_auth<R>(
    w: &World,
    who: &[&Address],
    fname: &str,
    args: Vec<Val>,
    f: impl FnOnce(&TobinClearingV1Client) -> R,
) -> R {
    let inv = MockAuthInvoke {
        contract: &w.clearing,
        fn_name: fname,
        args,
        sub_invokes: &[],
    };
    let auths: std::vec::Vec<MockAuth> = who
        .iter()
        .map(|a| MockAuth {
            address: a,
            invoke: &inv,
        })
        .collect();
    let c = clearing(w);
    let c = c.mock_auths(&auths);
    f(&c)
}

// ---- wrappers: `*_as` takes the signers explicitly (for negative authorization tests); the plain forms use the correct signers ----

pub fn create_as(
    w: &World,
    creator: &Acct,
    s: &BytesN<32>,
    tok: &Address,
    mp: u32,
    mo: u32,
    signers: &[&Address],
) -> Out {
    let args = (&creator.addr, s, tok, &mp, &mo).into_val(&w.env);
    classify(
        &w.env,
        run_auth(w, signers, "create_session", args, |c| {
            c.try_create_session(&creator.addr, s, tok, &mp, &mo)
        }),
    )
}
pub fn create(w: &World, creator: &Acct, s: &BytesN<32>, mp: u32, mo: u32) -> Out {
    create_as(w, creator, s, &w.token, mp, mo, &[&creator.addr])
}

pub fn join_as(w: &World, s: &BytesN<32>, who: &Acct, signers: &[&Address]) -> Out {
    let args = (s, &who.addr).into_val(&w.env);
    classify(
        &w.env,
        run_auth(w, signers, "join_session", args, |c| {
            c.try_join_session(s, &who.addr)
        }),
    )
}
/// the correct join: the joiner AND the creator authorize
pub fn join(w: &World, s: &BytesN<32>, who: &Acct, creator: &Acct) -> Out {
    join_as(w, s, who, &[&who.addr, &creator.addr])
}

pub fn ob(w: &World, id: u8, d: &Acct, c: &Acct, amount: i128) -> Obligation {
    Obligation {
        id: oid(w, id),
        debtor: d.addr.clone(),
        creditor: c.addr.clone(),
        amount,
    }
}
pub fn submit_as(w: &World, s: &BytesN<32>, o: &Obligation, signers: &[&Address]) -> Out {
    let args = (s, o).into_val(&w.env);
    classify(
        &w.env,
        run_auth(w, signers, "submit_obligation", args, |c| {
            c.try_submit_obligation(s, o)
        }),
    )
}
/// the correct submission: the debtor authorizes
pub fn submit(w: &World, s: &BytesN<32>, o: &Obligation) -> Out {
    submit_as(w, s, o, &[&o.debtor.clone()])
}

pub fn finalize_as(w: &World, s: &BytesN<32>, caller: &Address, signers: &[&Address]) -> Out {
    let args = (s, caller).into_val(&w.env);
    classify(
        &w.env,
        run_auth(w, signers, "finalize_obligations", args, |c| {
            c.try_finalize_obligations(s, caller)
        }),
    )
}
pub fn finalize(w: &World, s: &BytesN<32>, caller: &Acct) -> Out {
    finalize_as(w, s, &caller.addr, &[&caller.addr])
}

pub fn propose_as(
    w: &World,
    s: &BytesN<32>,
    proposer: &Address,
    ins: &Vec<Instruction>,
    signers: &[&Address],
) -> Out {
    let args = (s, proposer, ins).into_val(&w.env);
    classify(
        &w.env,
        run_auth(w, signers, "propose_settlement", args, |c| {
            c.try_propose_settlement(s, proposer, ins)
        }),
    )
}
pub fn propose(w: &World, s: &BytesN<32>, proposer: &Acct, ins: &Vec<Instruction>) -> Out {
    propose_as(w, s, &proposer.addr, ins, &[&proposer.addr])
}

pub fn approve_as(
    w: &World,
    s: &BytesN<32>,
    who: &Address,
    digest: &BytesN<32>,
    signers: &[&Address],
) -> Out {
    let args = (s, who, digest).into_val(&w.env);
    classify(
        &w.env,
        run_auth(w, signers, "approve_settlement", args, |c| {
            c.try_approve_settlement(s, who, digest)
        }),
    )
}
pub fn approve(w: &World, s: &BytesN<32>, who: &Acct, digest: &BytesN<32>) -> Out {
    approve_as(w, s, &who.addr, digest, &[&who.addr])
}

// ---- plans ----

pub fn xkey(env: &Env, a: &Address) -> std::vec::Vec<u8> {
    let b: Bytes = a.clone().to_xdr(env);
    let mut v = std::vec![0u8; b.len() as usize];
    b.copy_into_slice(&mut v);
    v
}

/// An instruction list in the contract's required order (strictly ascending by payer then payee, as XDR bytes).
pub fn plan(w: &World, list: &[(&Acct, &Acct, i128)]) -> Vec<Instruction> {
    let mut items: std::vec::Vec<(std::vec::Vec<u8>, std::vec::Vec<u8>, Instruction)> = list
        .iter()
        .map(|(p, q, amt)| {
            (
                xkey(&w.env, &p.addr),
                xkey(&w.env, &q.addr),
                Instruction {
                    payer: p.addr.clone(),
                    payee: q.addr.clone(),
                    amount: *amt,
                },
            )
        })
        .collect();
    items.sort_by(|x, y| (&x.0, &x.1).cmp(&(&y.0, &y.1)));
    let mut v = Vec::new(&w.env);
    for (_, _, i) in items {
        v.push_back(i);
    }
    v
}

/// The list exactly as given, with no sorting (for ordering tests).
pub fn raw_plan(w: &World, list: &[(&Acct, &Acct, i128)]) -> Vec<Instruction> {
    let mut v = Vec::new(&w.env);
    for (p, q, amt) in list {
        v.push_back(Instruction {
            payer: p.addr.clone(),
            payee: q.addr.clone(),
            amount: *amt,
        });
    }
    v
}

// ---- settlement with explicit debtor authorizations ----

pub struct Sign {
    pub who: Address,
    pub digest: BytesN<32>,
    pub total: i128,
    pub transfers: std::vec::Vec<(Address, Address, i128)>,
}

/// What each debtor must sign for this plan: root `settle(session, digest, its total)` with its own `transfer` sub-invocations.
pub fn good_signs(
    w: &World,
    s: &BytesN<32>,
    digest: &BytesN<32>,
    plan: &Vec<Instruction>,
) -> std::vec::Vec<Sign> {
    let _ = s;
    let mut out: std::vec::Vec<Sign> = std::vec::Vec::new();
    for i in plan.iter() {
        match out.iter_mut().find(|x| x.who == i.payer) {
            Some(x) => {
                x.total += i.amount;
                x.transfers
                    .push((i.payer.clone(), i.payee.clone(), i.amount));
            }
            None => out.push(Sign {
                who: i.payer.clone(),
                digest: digest.clone(),
                total: i.amount,
                transfers: std::vec![(i.payer.clone(), i.payee.clone(), i.amount)],
            }),
        }
    }
    let _ = w;
    out
}

pub fn settle_with(w: &World, s: &BytesN<32>, digest: &BytesN<32>, signs: &[Sign]) -> Out {
    let subs: std::vec::Vec<std::vec::Vec<MockAuthInvoke>> = signs
        .iter()
        .map(|g| {
            g.transfers
                .iter()
                .map(|(f, t, amt)| MockAuthInvoke {
                    contract: &w.token,
                    fn_name: "transfer",
                    args: (f, t, amt).into_val(&w.env),
                    sub_invokes: &[],
                })
                .collect()
        })
        .collect();
    let roots: std::vec::Vec<MockAuthInvoke> = signs
        .iter()
        .enumerate()
        .map(|(i, g)| MockAuthInvoke {
            contract: &w.clearing,
            fn_name: "settle",
            args: soroban_sdk::vec![
                &w.env,
                s.into_val(&w.env),
                g.digest.into_val(&w.env),
                g.total.into_val(&w.env)
            ],
            sub_invokes: &subs[i],
        })
        .collect();
    let auths: std::vec::Vec<MockAuth> = signs
        .iter()
        .enumerate()
        .map(|(i, g)| MockAuth {
            address: &g.who,
            invoke: &roots[i],
        })
        .collect();
    let c = clearing(w);
    let c = c.mock_auths(&auths);
    classify(&w.env, c.try_settle(s, digest))
}

/// Settle with the correct debtor authorizations.
pub fn settle(w: &World, s: &BytesN<32>, digest: &BytesN<32>, plan: &Vec<Instruction>) -> Out {
    let signs = good_signs(w, s, digest, plan);
    settle_with(w, s, digest, &signs)
}

// ---- common scenarios ----

/// The README example: A owes B 100, B owes C 80, C owes A 70. Nets (outgoing minus incoming): A +30, B -20, C -10.
/// Creator A; B and C join; obligations submitted by their debtors; finalized by `finalizer`. Returns the session id.
pub fn readme_session(w: &World, n: u8, finalizer: &Acct) -> BytesN<32> {
    let s = sid(w, n);
    must(create(w, &w.a, &s, 4, 16));
    must(join(w, &s, &w.b, &w.a));
    must(join(w, &s, &w.c, &w.a));
    must(submit(w, &s, &ob(w, 3, &w.c, &w.a, 70)));
    must(submit(w, &s, &ob(w, 1, &w.a, &w.b, 100)));
    must(submit(w, &s, &ob(w, 2, &w.b, &w.c, 80)));
    must(finalize(w, &s, finalizer));
    s
}

/// The only valid plan for the README example.
pub fn readme_plan(w: &World) -> Vec<Instruction> {
    plan(w, &[(&w.a, &w.b, 20), (&w.a, &w.c, 10)])
}

/// Four participants, nets A +10, B +10, C -10, D -10 (two debtors, two creditors): two different valid plans exist.
pub fn four_session(w: &World, n: u8) -> BytesN<32> {
    let s = sid(w, n);
    must(create(w, &w.a, &s, 4, 16));
    for p in [&w.b, &w.c, &w.d] {
        must(join(w, &s, p, &w.a));
    }
    must(submit(w, &s, &ob(w, 1, &w.a, &w.c, 10)));
    must(submit(w, &s, &ob(w, 2, &w.b, &w.d, 10)));
    must(finalize(w, &s, &w.d));
    s
}

/// `approve_settlement` with the participant's own authorization, returning the completion flag.
pub fn approve_bool(w: &World, s: &BytesN<32>, who: &Acct, digest: &BytesN<32>) -> bool {
    let args = (s, &who.addr, digest).into_val(&w.env);
    run_auth(w, &[&who.addr], "approve_settlement", args, |c| {
        c.approve_settlement(s, &who.addr, digest)
    })
}

/// `propose_settlement` returning the digest.
pub fn propose_digest(
    w: &World,
    s: &BytesN<32>,
    proposer: &Acct,
    ins: &Vec<Instruction>,
) -> BytesN<32> {
    let args = (s, &proposer.addr, ins).into_val(&w.env);
    run_auth(w, &[&proposer.addr], "propose_settlement", args, |c| {
        c.propose_settlement(s, &proposer.addr, ins)
    })
}

/// Number of events the clearing contract published in the most recent invocation (the test host keeps only the last one's).
pub fn clearing_events(w: &World) -> usize {
    use soroban_sdk::testutils::Events as _;
    w.env
        .events()
        .all()
        .filter_by_contract(&w.clearing)
        .events()
        .len()
}

pub fn digest_of(w: &World, s: &BytesN<32>) -> BytesN<32> {
    clearing(w).get_proposal(s).digest
}

pub fn state_of(w: &World, s: &BytesN<32>) -> tobin_clearing_v1::State {
    clearing(w).get_session(s).state
}

/// All admitted participants approve `digest`.
pub fn approve_all(w: &World, s: &BytesN<32>, digest: &BytesN<32>) {
    let parts = clearing(w).get_session(s).participants;
    for p in parts.iter() {
        let acct = [&w.a, &w.b, &w.c, &w.d]
            .into_iter()
            .find(|x| x.addr == p)
            .unwrap();
        must(approve(w, s, acct, digest));
    }
}

// ---- independent byte builders for the digests (same-author encoder written from CD section 5) ----
pub fn put_addr(v: &mut std::vec::Vec<u8>, x: &[u8]) {
    v.push(x.len() as u8);
    v.extend_from_slice(x);
}

pub fn header(
    w: &World,
    tag: &str,
    s: &BytesN<32>,
    token: &soroban_sdk::Address,
) -> std::vec::Vec<u8> {
    let mut v = std::vec::Vec::new();
    v.push(tag.len() as u8);
    v.extend_from_slice(tag.as_bytes());
    v.extend_from_slice(&2u32.to_be_bytes());
    v.extend_from_slice(&w.env.ledger().network_id().to_array());
    v.extend_from_slice(&xkey(&w.env, &w.clearing)[8..40]); // the raw contract id: the last 32 bytes of the 40-byte contract address XDR
    v.extend_from_slice(&s.to_array());
    v.extend_from_slice(&xkey(&w.env, token)[8..40]);
    v
}

pub fn expected_pd_bytes(
    w: &World,
    s: &BytesN<32>,
    token: &soroban_sdk::Address,
    oc: &BytesN<32>,
    revision: u32,
    ins: &[(&Acct, &Acct, i128)],
) -> std::vec::Vec<u8> {
    let mut v = header(w, "TOBIN-MVP1/SETTLEMENT/v2", s, token);
    v.extend_from_slice(&oc.to_array());
    v.extend_from_slice(&revision.to_be_bytes());
    v.extend_from_slice(&(ins.len() as u32).to_be_bytes());
    for (p, q, amt) in ins {
        put_addr(&mut v, &xkey(&w.env, &p.addr));
        put_addr(&mut v, &xkey(&w.env, &q.addr));
        v.extend_from_slice(&amt.to_be_bytes());
    }
    v
}

pub fn to_vec(b: &Bytes) -> std::vec::Vec<u8> {
    let mut v = std::vec![0u8; b.len() as usize];
    b.copy_into_slice(&mut v);
    v
}

pub fn sha(w: &World, v: &[u8]) -> BytesN<32> {
    w.env
        .crypto()
        .sha256(&Bytes::from_slice(&w.env, v))
        .to_bytes()
}
