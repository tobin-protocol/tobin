//! Real signatures. CLASSIC accounts (G... addresses) with ledger account entries, the CUSTOM TobinTestToken, and authorization entries carrying
//! REAL ed25519 signatures over the Soroban authorization preimage (the construction `authorizeEntry` of the Stellar SDKs uses), applied with
//! `set_auths`, which "requires valid signatures": the host verifies each signature against the account entry. Covers (1) a join authorized by two
//! distinct signers (the joiner and the creator), and (2) a settlement authorized by two debtors, now with the custom token.
//! Still NOT shown: that any wallet produces such a signature, a transaction envelope, fees, the transaction source account, simulation,
//! footprints or a network (DB-13: not authorized). The keys are test keys.
#![cfg(test)]
mod support;
use ed25519_dalek::{Signer, SigningKey};
use soroban_sdk::{
    testutils::Ledger as _,
    xdr::{self, Limits, WriteXdr},
    Address, Bytes, BytesN, Env, IntoVal, TryFromVal, Val,
};
use support::*;
use tobin_clearing_v1::{Error, Instruction, State};

fn sc<T: IntoVal<Env, Val>>(env: &Env, t: &T) -> xdr::ScVal {
    let v: Val = t.into_val(env);
    xdr::ScVal::try_from_val(env, &v).unwrap()
}

fn sc_addr(a: &Address) -> xdr::ScAddress {
    a.try_into().unwrap()
}

fn invocation(
    f: &str,
    contract: &Address,
    args: std::vec::Vec<xdr::ScVal>,
    subs: std::vec::Vec<xdr::SorobanAuthorizedInvocation>,
) -> xdr::SorobanAuthorizedInvocation {
    xdr::SorobanAuthorizedInvocation {
        function: xdr::SorobanAuthorizedFunction::ContractFn(xdr::InvokeContractArgs {
            contract_address: sc_addr(contract),
            function_name: f.try_into().unwrap(),
            args: args.try_into().unwrap(),
        }),
        sub_invocations: subs.try_into().unwrap(),
    }
}

struct SignOpts<'a> {
    key: Option<&'a SigningKey>,
    signed_tree: Option<xdr::SorobanAuthorizedInvocation>,
    network_id: Option<[u8; 32]>,
    expiry: Option<u32>,
}

fn opts<'a>() -> SignOpts<'a> {
    SignOpts {
        key: None,
        signed_tree: None,
        network_id: None,
        expiry: None,
    }
}

fn signed_entry(
    w: &World,
    who: &Acct,
    root: xdr::SorobanAuthorizedInvocation,
    nonce: i64,
    o: SignOpts,
) -> xdr::SorobanAuthorizationEntry {
    let expiry = o.expiry.unwrap_or(w.env.ledger().sequence() + 100);
    let net = o
        .network_id
        .unwrap_or_else(|| w.env.ledger().network_id().to_array());
    let preimage =
        xdr::HashIdPreimage::SorobanAuthorization(xdr::HashIdPreimageSorobanAuthorization {
            network_id: xdr::Hash(net),
            nonce,
            signature_expiration_ledger: expiry,
            invocation: o.signed_tree.unwrap_or_else(|| root.clone()),
        });
    let payload = w.env.crypto().sha256(&Bytes::from_slice(
        &w.env,
        &preimage.to_xdr(Limits::none()).unwrap(),
    ));
    let key = o.key.unwrap_or(&who.key);
    let sig = key.sign(&payload.to_array()).to_bytes();
    let entry = |k: &str, v: xdr::ScVal| xdr::ScMapEntry {
        key: xdr::ScVal::Symbol(k.try_into().unwrap()),
        val: v,
    };
    let signature = xdr::ScVal::Vec(Some(xdr::ScVec(
        std::vec![xdr::ScVal::Map(Some(xdr::ScMap(
            std::vec![
                entry(
                    "public_key",
                    xdr::ScVal::Bytes(xdr::ScBytes(
                        key.verifying_key().to_bytes().to_vec().try_into().unwrap()
                    ))
                ),
                entry(
                    "signature",
                    xdr::ScVal::Bytes(xdr::ScBytes(sig.to_vec().try_into().unwrap()))
                ),
            ]
            .try_into()
            .unwrap(),
        )))]
        .try_into()
        .unwrap(),
    )));
    xdr::SorobanAuthorizationEntry {
        credentials: xdr::SorobanCredentials::Address(xdr::SorobanAddressCredentials {
            address: sc_addr(&who.addr),
            nonce,
            signature_expiration_ledger: expiry,
            signature,
        }),
        root_invocation: root,
    }
}

/// Ordinary setup under `mock_all_auths` (classic accounts are fine there); the call under test then uses `set_auths` with real signatures.
fn setup_session(w: &World) -> BytesN<32> {
    w.env.mock_all_auths();
    let c = clearing(w);
    let s = sid(w, 1);
    c.create_session(&w.a.addr, &s, &w.token, &4, &16);
    c.join_session(&s, &w.b.addr);
    c.join_session(&s, &w.c.addr);
    c.submit_obligation(&s, &ob(w, 1, &w.a, &w.b, 100));
    c.submit_obligation(&s, &ob(w, 2, &w.b, &w.c, 80));
    c.submit_obligation(&s, &ob(w, 3, &w.c, &w.a, 70));
    c.finalize_obligations(&s, &w.c.addr);
    s
}

#[test]
fn s0_the_participants_are_classic_accounts_and_the_token_is_the_custom_contract() {
    let w = world_real();
    assert!(matches!(sc_addr(&w.a.addr), xdr::ScAddress::Account(_)));
    assert!(matches!(sc_addr(&w.token), xdr::ScAddress::Contract(_)));
    assert_eq!(token(&w).cap(), CAP);
}

fn join_tree(w: &World, s: &BytesN<32>, joiner: &Acct) -> xdr::SorobanAuthorizedInvocation {
    invocation(
        "join_session",
        &w.clearing,
        std::vec![sc(&w.env, s), sc(&w.env, &joiner.addr)],
        std::vec![],
    )
}

fn try_join(
    w: &World,
    s: &BytesN<32>,
    joiner: &Acct,
    entries: &[xdr::SorobanAuthorizationEntry],
) -> Out {
    classify(
        &w.env,
        clearing(w)
            .set_auths(entries)
            .try_join_session(s, &joiner.addr),
    )
}

#[test]
fn s1_a_join_authorized_by_two_distinct_signers_with_real_signatures() {
    let w = world_real();
    w.env.mock_all_auths();
    let s = sid(&w, 1);
    clearing(&w).create_session(&w.a.addr, &s, &w.token, &4, &16);
    let tree = join_tree(&w, &s, &w.b);
    let ej = signed_entry(&w, &w.b, tree.clone(), 11, opts());
    let ec = signed_entry(&w, &w.a, tree.clone(), 12, opts());
    must(try_join(&w, &s, &w.b, &[ej, ec]));
    let authed: std::vec::Vec<_> = w.env.auths().into_iter().map(|(a, _)| a).collect();
    assert_eq!(authed.len(), 2);
    assert!(authed.contains(&w.a.addr) && authed.contains(&w.b.addr));
    assert_eq!(clearing(&w).get_session(&s).participants.len(), 2);
}

#[test]
fn s2_a_join_with_only_one_signer_a_wrong_key_or_a_substituted_joiner_is_rejected() {
    let w = world_real();
    w.env.mock_all_auths();
    let s = sid(&w, 1);
    clearing(&w).create_session(&w.a.addr, &s, &w.token, &4, &16);
    let tree = join_tree(&w, &s, &w.b);
    // only the joiner / only the creator
    assert!(matches!(
        try_join(
            &w,
            &s,
            &w.b,
            &[signed_entry(&w, &w.b, tree.clone(), 1, opts())]
        ),
        Out::Host(_)
    ));
    assert!(matches!(
        try_join(
            &w,
            &s,
            &w.b,
            &[signed_entry(&w, &w.a, tree.clone(), 2, opts())]
        ),
        Out::Host(_)
    ));
    // the creator's entry signed with a key that is not its signer
    let wrong = SigningKey::from_bytes(&[99; 32]);
    let bad_creator = signed_entry(
        &w,
        &w.a,
        tree.clone(),
        3,
        SignOpts {
            key: Some(&wrong),
            ..opts()
        },
    );
    assert!(matches!(
        try_join(
            &w,
            &s,
            &w.b,
            &[signed_entry(&w, &w.b, tree.clone(), 4, opts()), bad_creator]
        ),
        Out::Host(_)
    ));
    // entries made for B's join, presented for C's join
    let (eb, ea) = (
        signed_entry(&w, &w.b, tree.clone(), 5, opts()),
        signed_entry(&w, &w.a, tree.clone(), 6, opts()),
    );
    assert!(matches!(try_join(&w, &s, &w.c, &[eb, ea]), Out::Host(_)));
    assert_eq!(
        clearing(&w).get_session(&s).participants.len(),
        1,
        "nobody was admitted"
    );
}

fn settle_tree(
    w: &World,
    s: &BytesN<32>,
    digest: &BytesN<32>,
    total: i128,
    transfers: &[(&Acct, &Acct, i128)],
) -> xdr::SorobanAuthorizedInvocation {
    let subs = transfers
        .iter()
        .map(|(f, t, amt)| {
            invocation(
                "transfer",
                &w.token,
                std::vec![sc(&w.env, &f.addr), sc(&w.env, &t.addr), sc(&w.env, amt)],
                std::vec![],
            )
        })
        .collect();
    invocation(
        "settle",
        &w.clearing,
        std::vec![sc(&w.env, s), sc(&w.env, digest), sc(&w.env, &total)],
        subs,
    )
}

fn try_settle(
    w: &World,
    s: &BytesN<32>,
    digest: &BytesN<32>,
    entries: &[xdr::SorobanAuthorizationEntry],
) -> Out {
    classify(&w.env, clearing(w).set_auths(entries).try_settle(s, digest))
}

/// README session fully approved (setup under mock_all_auths), A funded; returns (session, digest, plan).
fn ready(w: &World) -> (BytesN<32>, BytesN<32>, soroban_sdk::Vec<Instruction>) {
    let s = setup_session(w);
    let c = clearing(w);
    let p = readme_plan(w);
    let d = c.propose_settlement(&s, &w.b.addr, &p);
    for who in [&w.a, &w.b, &w.c] {
        c.approve_settlement(&s, &who.addr, &d);
    }
    token(w).mint(&w.a.addr, &100);
    assert_eq!(state_of(w, &s), State::Approved);
    (s, d, p)
}

#[test]
fn s3_a_settlement_signed_by_the_debtor_moves_the_custom_token() {
    // in the README example A is the only debtor: A pays B 20 and C 10 under ONE entry carrying both transfers
    let w = world_real();
    let (s, d, _p) = ready(&w);
    let ea = signed_entry(
        &w,
        &w.a,
        settle_tree(&w, &s, &d, 30, &[(&w.a, &w.b, 20), (&w.a, &w.c, 10)]),
        21,
        opts(),
    );
    must(try_settle(&w, &s, &d, &[ea]));
    println!("signed README settlement resources (host test; native or Wasm per environment; real ed25519 entry): {:?}", w.env.cost_estimate().resources());
    let authed: std::vec::Vec<_> = w.env.auths().into_iter().map(|(a, _)| a).collect();
    assert_eq!(
        authed,
        std::vec![w.a.addr.clone()],
        "only the debtor authorized; no submitter, no approver, no creator"
    );
    assert_eq!((bal(&w, &w.a), bal(&w, &w.b), bal(&w, &w.c)), (70, 20, 10));
    assert_eq!(state_of(&w, &s), State::Settled);
}

#[test]
fn s4_two_independent_debtors_each_sign_their_own_entry() {
    // four participants: A and B are debtors of 10; C and D creditors
    let w = world_real();
    w.env.mock_all_auths();
    let c = clearing(&w);
    let s = sid(&w, 2);
    c.create_session(&w.a.addr, &s, &w.token, &4, &16);
    for p in [&w.b, &w.c, &w.d] {
        c.join_session(&s, &p.addr);
    }
    c.submit_obligation(&s, &ob(&w, 1, &w.a, &w.c, 10));
    c.submit_obligation(&s, &ob(&w, 2, &w.b, &w.d, 10));
    c.finalize_obligations(&s, &w.d.addr);
    let p = plan(&w, &[(&w.a, &w.c, 10), (&w.b, &w.d, 10)]);
    let d = c.propose_settlement(&s, &w.a.addr, &p);
    for who in [&w.a, &w.b, &w.c, &w.d] {
        c.approve_settlement(&s, &who.addr, &d);
    }
    token(&w).mint(&w.a.addr, &10);
    token(&w).mint(&w.b.addr, &10);
    let ea = signed_entry(
        &w,
        &w.a,
        settle_tree(&w, &s, &d, 10, &[(&w.a, &w.c, 10)]),
        31,
        opts(),
    );
    let eb = signed_entry(
        &w,
        &w.b,
        settle_tree(&w, &s, &d, 10, &[(&w.b, &w.d, 10)]),
        32,
        opts(),
    );
    // a missing second entry is rejected and nothing moves
    assert!(matches!(
        try_settle(&w, &s, &d, &[ea.clone()]),
        Out::Host(_)
    ));
    assert_eq!((bal(&w, &w.a), bal(&w, &w.b)), (10, 10));
    must(try_settle(&w, &s, &d, &[ea, eb]));
    assert_eq!(
        (bal(&w, &w.a), bal(&w, &w.b), bal(&w, &w.c), bal(&w, &w.d)),
        (0, 0, 10, 10)
    );
    assert_eq!(state_of(&w, &s), State::Settled);
}

#[test]
fn s5_bad_signatures_and_tampering_are_rejected_and_nothing_moves() {
    let w = world_real();
    let (s, d, _p) = ready(&w);
    let tree = settle_tree(&w, &s, &d, 30, &[(&w.a, &w.b, 20), (&w.a, &w.c, 10)]);
    let wrong = SigningKey::from_bytes(&[99; 32]);
    let altered_after_signing = settle_tree(&w, &s, &d, 1, &[(&w.a, &w.b, 1)]);
    let mut other_digest = d.to_array();
    other_digest[0] ^= 1;
    let other_digest = BytesN::from_array(&w.env, &other_digest);
    let cases: std::vec::Vec<(&str, xdr::SorobanAuthorizationEntry)> = std::vec![
        (
            "a key that is not the account signer",
            signed_entry(
                &w,
                &w.a,
                tree.clone(),
                1,
                SignOpts {
                    key: Some(&wrong),
                    ..opts()
                }
            )
        ),
        (
            "a tree altered after signing",
            signed_entry(
                &w,
                &w.a,
                tree.clone(),
                2,
                SignOpts {
                    signed_tree: Some(altered_after_signing),
                    ..opts()
                }
            )
        ),
        (
            "a signature for another network",
            signed_entry(
                &w,
                &w.a,
                tree.clone(),
                3,
                SignOpts {
                    network_id: Some([7; 32]),
                    ..opts()
                }
            )
        ),
        (
            "an entry for another digest",
            signed_entry(
                &w,
                &w.a,
                settle_tree(
                    &w,
                    &s,
                    &other_digest,
                    30,
                    &[(&w.a, &w.b, 20), (&w.a, &w.c, 10)]
                ),
                4,
                opts()
            )
        ),
        (
            "a different total",
            signed_entry(
                &w,
                &w.a,
                settle_tree(&w, &s, &d, 31, &[(&w.a, &w.b, 20), (&w.a, &w.c, 10)]),
                5,
                opts()
            )
        ),
        (
            "a missing transfer sub-invocation",
            signed_entry(
                &w,
                &w.a,
                settle_tree(&w, &s, &d, 30, &[(&w.a, &w.b, 20)]),
                6,
                opts()
            )
        ),
    ];
    for (name, e) in cases {
        let out = try_settle(&w, &s, &d, &[e]);
        assert!(matches!(out, Out::Host(_)), "{name}: {out:?}");
        assert_eq!(
            (bal(&w, &w.a), bal(&w, &w.b), bal(&w, &w.c)),
            (100, 0, 0),
            "{name}"
        );
    }
    assert_eq!(state_of(&w, &s), State::Approved);
}

#[test]
fn s6_an_expired_entry_is_rejected_and_a_fresh_one_settles() {
    let w = world_real();
    let (s, d, _p) = ready(&w);
    w.env.ledger().with_mut(|l| l.sequence_number = 500);
    let tree = settle_tree(&w, &s, &d, 30, &[(&w.a, &w.b, 20), (&w.a, &w.c, 10)]);
    let expired = signed_entry(
        &w,
        &w.a,
        tree.clone(),
        1,
        SignOpts {
            expiry: Some(499),
            ..opts()
        },
    );
    assert!(matches!(try_settle(&w, &s, &d, &[expired]), Out::Host(_)));
    assert_eq!(bal(&w, &w.a), 100);
    must(try_settle(
        &w,
        &s,
        &d,
        &[signed_entry(&w, &w.a, tree, 2, opts())],
    ));
    assert_eq!(bal(&w, &w.a), 70);
}

#[test]
fn s7_a_settled_session_cannot_be_settled_again_even_with_fresh_valid_signatures() {
    let w = world_real();
    let (s, d, _p) = ready(&w);
    let tree = settle_tree(&w, &s, &d, 30, &[(&w.a, &w.b, 20), (&w.a, &w.c, 10)]);
    must(try_settle(
        &w,
        &s,
        &d,
        &[signed_entry(&w, &w.a, tree.clone(), 1, opts())],
    ));
    token(&w).mint(&w.a.addr, &100);
    assert_eq!(
        try_settle(&w, &s, &d, &[signed_entry(&w, &w.a, tree, 2, opts())]),
        Out::Contract(Error::AlreadySettled)
    );
    assert_eq!(bal(&w, &w.a), 170);
}
