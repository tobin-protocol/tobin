//! Focused tests of the narrow local authorization-entry signer (signer/mod.rs) against the real Soroban test host. The host's `set_auths` "requires
//! valid signatures": it verifies every entry's signature against the classic account entry, so acceptance here is the host's own verification. The
//! signer REQUIRES an expected intent; the intents below are built from structured values (as the TypeScript SDK builds them), never from the envelope
//! under test. Still NOT shown: that any wallet or the Stellar CLI produces the same bytes, a network. Offline.
#![cfg(test)]
#[path = "../signer/mod.rs"]
mod signer;
mod support;
use ed25519_dalek::SigningKey;
use serde_json::{json, Value};
use signer::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger as _},
    xdr::{self, Limits, ReadXdr, WriteXdr},
    Address, BytesN, Env, IntoVal, TryFromVal, Val,
};
use support::*;
use tobin_clearing_v1::State;

const PASS: &str = "Standalone Network ; February 2017";
const OTHER_PASS: &str = "Test SDF Network ; September 2015";

/// The host test ledger is the trustworthy current ledger here; a real caller must take it from a source it trusts (see signer/mod.rs).
fn cur(w: &World) -> Option<u32> {
    Some(w.env.ledger().sequence())
}
/// The latest expiration the policy allows (current + 10).
fn exp(w: &World) -> u32 {
    w.env.ledger().sequence() + MAX_AUTH_LIFETIME_LEDGERS
}

// ---- the XDR side: what an envelope carries ----

fn sc<T: IntoVal<Env, Val>>(env: &Env, t: &T) -> xdr::ScVal {
    let v: Val = t.into_val(env);
    xdr::ScVal::try_from_val(env, &v).unwrap()
}
fn sc_addr(a: &Address) -> xdr::ScAddress {
    a.into()
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
fn join_tree(w: &World, s: &BytesN<32>, joiner: &Acct) -> xdr::SorobanAuthorizedInvocation {
    invocation(
        "join_session",
        &w.clearing,
        std::vec![sc(&w.env, s), sc(&w.env, &joiner.addr)],
        std::vec![],
    )
}
fn transfer_xdr(
    w: &World,
    token: &Address,
    from: &Acct,
    to: &Acct,
    amt: i128,
) -> xdr::SorobanAuthorizedInvocation {
    invocation(
        "transfer",
        token,
        std::vec![
            sc(&w.env, &from.addr),
            sc(&w.env, &to.addr),
            sc(&w.env, &amt)
        ],
        std::vec![],
    )
}
fn settle_xdr(
    w: &World,
    root: &Address,
    f: &str,
    s: &BytesN<32>,
    d: &BytesN<32>,
    total: i128,
    subs: std::vec::Vec<xdr::SorobanAuthorizedInvocation>,
) -> xdr::SorobanAuthorizedInvocation {
    invocation(
        f,
        root,
        std::vec![sc(&w.env, s), sc(&w.env, d), sc(&w.env, &total)],
        subs,
    )
}
/// payer pays each `(payee, amount)` in the given order; the contract's order is ascending by address, see `ordered`
fn good_settle(
    w: &World,
    s: &BytesN<32>,
    d: &BytesN<32>,
    payer: &Acct,
    pays: &[(&Acct, i128)],
) -> xdr::SorobanAuthorizedInvocation {
    let total: i128 = pays.iter().map(|p| p.1).sum();
    settle_xdr(
        w,
        &w.clearing,
        "settle",
        s,
        d,
        total,
        pays.iter()
            .map(|(to, a)| transfer_xdr(w, &w.token, payer, to, *a))
            .collect(),
    )
}
fn ordered<'a>(w: &World, v: &[(&'a Acct, i128)]) -> std::vec::Vec<(&'a Acct, i128)> {
    let mut v = v.to_vec();
    v.sort_by_key(|p| xkey(&w.env, &p.0.addr));
    v
}

/// An unsigned address-credential entry as simulation would record it (expiration 0, void signature).
fn unsigned(
    who: &Acct,
    nonce: i64,
    tree: xdr::SorobanAuthorizedInvocation,
) -> xdr::SorobanAuthorizationEntry {
    xdr::SorobanAuthorizationEntry {
        credentials: xdr::SorobanCredentials::Address(xdr::SorobanAddressCredentials {
            address: sc_addr(&who.addr),
            nonce,
            signature_expiration_ledger: 0,
            signature: xdr::ScVal::Void,
        }),
        root_invocation: tree,
    }
}
fn envelope(
    w: &World,
    entries: std::vec::Vec<xdr::SorobanAuthorizationEntry>,
) -> xdr::TransactionEnvelope {
    let ihf = xdr::InvokeHostFunctionOp {
        host_function: xdr::HostFunction::InvokeContract(xdr::InvokeContractArgs {
            contract_address: sc_addr(&w.clearing),
            function_name: "join_session".try_into().unwrap(),
            args: std::vec![].try_into().unwrap(),
        }),
        auth: entries.try_into().unwrap(),
    };
    let tx = xdr::Transaction {
        source_account: xdr::MuxedAccount::Ed25519(xdr::Uint256([5; 32])),
        fee: 100,
        seq_num: xdr::SequenceNumber(1),
        cond: xdr::Preconditions::None,
        memo: xdr::Memo::None,
        operations: std::vec![xdr::Operation {
            source_account: None,
            body: xdr::OperationBody::InvokeHostFunction(ihf)
        }]
        .try_into()
        .unwrap(),
        ext: xdr::TransactionExt::V0,
    };
    xdr::TransactionEnvelope::Tx(xdr::TransactionV1Envelope {
        tx,
        signatures: std::vec![].try_into().unwrap(),
    })
}
fn entries_of(e: &xdr::TransactionEnvelope) -> std::vec::Vec<xdr::SorobanAuthorizationEntry> {
    let xdr::TransactionEnvelope::Tx(v1) = e else {
        panic!("not v1")
    };
    let xdr::OperationBody::InvokeHostFunction(ihf) = &v1.tx.operations[0].body else {
        panic!("not invoke")
    };
    ihf.auth.to_vec()
}
fn bytes_of(e: &xdr::TransactionEnvelope) -> std::vec::Vec<u8> {
    e.to_xdr(Limits::none()).unwrap()
}

/// The host verifies against the network id of its ledger, so the test ledger is given the real passphrase's id.
fn on_network(w: &World, passphrase: &str) {
    let id = network_id(passphrase);
    w.env.ledger().with_mut(|l| {
        l.network_id = id;
        l.sequence_number = 1000; // the test host starts at ledger 0, which the policy treats as an invalid current ledger
    });
}
fn open_session(w: &World) -> BytesN<32> {
    w.env.mock_all_auths();
    let s = sid(w, 1);
    clearing(w).create_session(&w.a.addr, &s, &w.token, &4, &16);
    s
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

// ---- the JSON side: what the intent says (built from structured values, never from an envelope) ----

fn strkey(a: &Address) -> String {
    format!("{}", a.to_string())
}
fn hex32(b: &BytesN<32>) -> String {
    b.to_array().iter().map(|x| format!("{x:02x}")).collect()
}
fn jaddr(a: &Address) -> Value {
    json!({"t": "addr", "v": strkey(a)})
}
fn jb32(b: &BytesN<32>) -> Value {
    json!({"t": "bytes32", "v": hex32(b)})
}
fn ji128(n: i128) -> Value {
    json!({"t": "i128", "v": n.to_string()})
}
fn jtree(contract: &Address, f: &str, args: Vec<Value>, subs: Vec<Value>) -> Value {
    json!({"contract": strkey(contract), "fn": f, "args": args, "subs": subs})
}
fn jjoin(w: &World, s: &BytesN<32>, joiner: &Acct) -> Value {
    jtree(
        &w.clearing,
        "join_session",
        vec![jb32(s), jaddr(&joiner.addr)],
        vec![],
    )
}
fn jsettle(
    w: &World,
    s: &BytesN<32>,
    d: &BytesN<32>,
    payer: &Acct,
    pays: &[(&Acct, i128)],
) -> Value {
    let total: i128 = pays.iter().map(|p| p.1).sum();
    let subs = pays
        .iter()
        .map(|(to, a)| {
            jtree(
                &w.token,
                "transfer",
                vec![jaddr(&payer.addr), jaddr(&to.addr), ji128(*a)],
                vec![],
            )
        })
        .collect();
    jtree(
        &w.clearing,
        "settle",
        vec![jb32(s), jb32(d), ji128(total)],
        subs,
    )
}
fn dep_json(w: &World, pass: &str) -> String {
    json!({"version": 1, "network_passphrase": pass, "clearing": strkey(&w.clearing), "token": strkey(&w.token)}).to_string()
}
fn dep(w: &World, pass: &str) -> DeploymentRecord {
    parse_deployment(&dep_json(w, pass)).unwrap()
}
fn intent_json(pass: &str, entries: &[(&Acct, Value)]) -> String {
    json!({"version": 1, "network_passphrase": pass, "entries": entries.iter().map(|(a, t)| json!({"signer": strkey(&a.addr), "tree": t})).collect::<Vec<_>>()}).to_string()
}
fn intent(w: &World, entries: &[(&Acct, Value)]) -> ExpectedIntent {
    parse_intent(&intent_json(PASS, entries), &dep(w, PASS)).unwrap()
}
fn bad_intent(w: &World, text: &str) -> String {
    parse_intent(text, &dep(w, PASS)).unwrap_err()
}

/// Encode a 32-byte seed as an `S...` strkey (the inverse of parse_secret), so the parser is tested against an independent encoder.
fn seed_strkey(seed: &[u8; 32]) -> String {
    let mut raw = std::vec![18u8 << 3];
    raw.extend_from_slice(seed);
    let mut crc: u16 = 0;
    for &b in &raw {
        crc ^= (b as u16) << 8;
        for _ in 0..8 {
            crc = if crc & 0x8000 != 0 {
                (crc << 1) ^ 0x1021
            } else {
                crc << 1
            };
        }
    }
    raw.extend_from_slice(&crc.to_le_bytes());
    const A: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    let (mut bits, mut n, mut out) = (0u32, 0u32, String::new());
    for b in raw {
        bits = (bits << 8) | b as u32;
        n += 8;
        while n >= 5 {
            n -= 5;
            out.push(A[((bits >> n) & 31) as usize] as char);
        }
    }
    out
}

#[test]
fn g0_the_secret_parser_round_trips_and_rejects_malformed_input_without_echoing_it() {
    let seed = [42u8; 32];
    let s = seed_strkey(&seed);
    assert_eq!(s.len(), 56);
    assert_eq!(parse_secret(&s).unwrap().to_bytes(), seed);
    assert_eq!(
        parse_secret(&format!("  {s}\n")).unwrap().to_bytes(),
        seed,
        "surrounding whitespace is ignored"
    );
    let mut bad_crc = s.clone().into_bytes();
    bad_crc[55] = if bad_crc[55] == b'A' { b'B' } else { b'A' };
    for bad in [
        String::from_utf8(bad_crc).unwrap(),
        s[..55].to_string(),
        format!("G{}", &s[1..]),
        s.replace('A', "1"),
        String::new(),
    ] {
        let err = parse_secret(&bad).unwrap_err();
        assert!(
            !err.contains(&s[..10]) && !err.contains(&bad) || bad.is_empty(),
            "the error must not echo the input: {err}"
        );
    }
}

#[test]
fn g1_a_valid_signature_from_two_distinct_signers_is_accepted_by_the_hosts_own_verification() {
    let w = world_real();
    on_network(&w, PASS);
    let s = open_session(&w);
    let tree = join_tree(&w, &s, &w.b);
    let it = intent(
        &w,
        &[(&w.b, jjoin(&w, &s, &w.b)), (&w.a, jjoin(&w, &s, &w.b))],
    );
    let mut env = envelope(
        &w,
        std::vec![
            unsigned(&w.b, 11, tree.clone()),
            unsigned(&w.a, 12, tree.clone())
        ],
    );
    let before = bytes_of(&env);
    let ledger = exp(&w);
    let rep = sign_envelope(
        &mut env,
        &it,
        &[w.b.key.clone(), w.a.key.clone()],
        cur(&w),
        ledger,
    )
    .unwrap();
    assert_eq!(rep.signed.len(), 2);
    assert!(rep.preserved.is_empty());
    // the recorded nonce, the invocation tree and the transaction are untouched; only credentials changed; the envelope is NOT signed
    let signed = entries_of(&env);
    for (i, e) in signed.iter().enumerate() {
        let xdr::SorobanCredentials::Address(c) = &e.credentials else {
            panic!()
        };
        assert_eq!(c.nonce, [11, 12][i]);
        assert_eq!(c.signature_expiration_ledger, ledger);
        assert!(matches!(c.signature, xdr::ScVal::Vec(Some(_))));
        assert_eq!(e.root_invocation, tree);
    }
    let xdr::TransactionEnvelope::Tx(v1) = &env else {
        panic!()
    };
    assert!(
        v1.signatures.is_empty(),
        "authorization signatures are never envelope signatures"
    );
    assert_ne!(bytes_of(&env), before);
    assert_eq!(
        read_envelope(&write_envelope(&env).unwrap()).unwrap(),
        env,
        "base64 round trip is lossless"
    );
    must(try_join(&w, &s, &w.b, &signed));
    assert_eq!(clearing(&w).get_session(&s).participants.len(), 2);
}

#[test]
fn g1b_a_co_signers_expected_entry_is_preserved_unchanged_and_can_be_signed_in_a_second_pass() {
    let w = world_real();
    on_network(&w, PASS);
    let s = open_session(&w);
    let tree = join_tree(&w, &s, &w.b);
    let it = intent(
        &w,
        &[(&w.b, jjoin(&w, &s, &w.b)), (&w.a, jjoin(&w, &s, &w.b))],
    );
    let original = envelope(
        &w,
        std::vec![unsigned(&w.b, 11, tree.clone()), unsigned(&w.a, 12, tree)],
    );
    let mut env = original.clone();
    let rep = sign_envelope(
        &mut env,
        &it,
        std::slice::from_ref(&w.b.key),
        cur(&w),
        exp(&w),
    )
    .unwrap();
    assert_eq!((rep.signed.len(), rep.preserved.len()), (1, 1));
    assert_eq!(
        entries_of(&env)[1],
        entries_of(&original)[1],
        "the co-signer's entry is byte-identical"
    );
    assert!(
        matches!(try_join(&w, &s, &w.b, &entries_of(&env)), Out::Host(_)),
        "the creator has not signed yet"
    );
    // the second signer receives the first signer's output; the already-signed entry is expected, matches, and is left alone
    let rep2 = sign_envelope(
        &mut env,
        &it,
        std::slice::from_ref(&w.a.key),
        cur(&w),
        exp(&w),
    )
    .unwrap();
    assert_eq!((rep2.signed.len(), rep2.preserved.len()), (1, 1));
    must(try_join(&w, &s, &w.b, &entries_of(&env)));
}

#[test]
fn g2_a_wrong_signer_is_refused_by_the_signer_and_by_the_host() {
    let w = world_real();
    on_network(&w, PASS);
    let s = open_session(&w);
    let tree = join_tree(&w, &s, &w.b);
    let it = intent(
        &w,
        &[(&w.b, jjoin(&w, &s, &w.b)), (&w.a, jjoin(&w, &s, &w.b))],
    );
    let original = envelope(
        &w,
        std::vec![unsigned(&w.b, 1, tree.clone()), unsigned(&w.a, 2, tree)],
    );
    // a key that owns no expected entry is an error, never a silent no-op, and nothing changes
    let stranger = SigningKey::from_bytes(&[99; 32]);
    let mut env = original.clone();
    assert!(sign_envelope(
        &mut env,
        &it,
        std::slice::from_ref(&stranger),
        cur(&w),
        exp(&w)
    )
    .unwrap_err()
    .contains("no expected entry"));
    assert_eq!(env, original);
    // another participant's key that is not in this intent is refused too
    let mut env2 = original.clone();
    assert!(sign_envelope(
        &mut env2,
        &it,
        std::slice::from_ref(&w.x.key),
        cur(&w),
        exp(&w)
    )
    .is_err());
    assert_eq!(env2, original);
    // the TEST-ONLY unchecked path can still produce a signature by the wrong key, and the HOST rejects it
    let mut es = entries_of(&original);
    sign_entry_unchecked_for_tests(&mut es[0], network_id(PASS), exp(&w), &w.b.key).unwrap();
    sign_entry_unchecked_for_tests(&mut es[1], network_id(PASS), exp(&w), &stranger).unwrap();
    assert!(matches!(try_join(&w, &s, &w.b, &es), Out::Host(_)));
    assert_eq!(
        clearing(&w).get_session(&s).participants.len(),
        1,
        "nobody was admitted"
    );
}

#[test]
fn g3_a_tampered_payload_is_rejected() {
    let w = world_real();
    on_network(&w, PASS);
    let s = open_session(&w);
    let tree = join_tree(&w, &s, &w.b);
    let it = intent(
        &w,
        &[(&w.b, jjoin(&w, &s, &w.b)), (&w.a, jjoin(&w, &s, &w.b))],
    );
    let mut env = envelope(
        &w,
        std::vec![unsigned(&w.b, 1, tree.clone()), unsigned(&w.a, 2, tree)],
    );
    sign_envelope(
        &mut env,
        &it,
        &[w.b.key.clone(), w.a.key.clone()],
        cur(&w),
        exp(&w),
    )
    .unwrap();
    let good = entries_of(&env);
    // (1) the invocation changed after signing: the joiner is swapped for C
    let mut swapped = good.clone();
    for e in swapped.iter_mut() {
        e.root_invocation = join_tree(&w, &s, &w.c);
    }
    assert!(matches!(try_join(&w, &s, &w.c, &swapped), Out::Host(_)));
    // (2) the nonce changed after signing
    let mut renonced = good.clone();
    if let xdr::SorobanCredentials::Address(c) = &mut renonced[0].credentials {
        c.nonce += 1;
    }
    assert!(matches!(try_join(&w, &s, &w.b, &renonced), Out::Host(_)));
    // (3) the expiration changed after signing
    let mut extended = good.clone();
    if let xdr::SorobanCredentials::Address(c) = &mut extended[1].credentials {
        c.signature_expiration_ledger += 1;
    }
    assert!(matches!(try_join(&w, &s, &w.b, &extended), Out::Host(_)));
    assert_eq!(clearing(&w).get_session(&s).participants.len(), 1);
    must(try_join(&w, &s, &w.b, &good)); // the untouched entries are still fine
}

#[test]
fn g4_a_network_passphrase_mismatch_is_rejected_by_the_intent_check_and_by_the_host() {
    let w = world_real();
    // the intent's passphrase must equal the pinned record's
    let other = intent_json(OTHER_PASS, &[(&w.a, jjoin(&w, &sid(&w, 1), &w.b))]);
    assert!(parse_intent(&other, &dep(&w, PASS))
        .unwrap_err()
        .contains("passphrase differs"));
    // a deployment AND intent pinned to the wrong network produce a signature the host (on the real network id) rejects
    on_network(&w, PASS);
    let s = open_session(&w);
    let tree = join_tree(&w, &s, &w.b);
    let wrong = parse_intent(
        &intent_json(
            OTHER_PASS,
            &[(&w.b, jjoin(&w, &s, &w.b)), (&w.a, jjoin(&w, &s, &w.b))],
        ),
        &dep(&w, OTHER_PASS),
    )
    .unwrap();
    let mut env = envelope(
        &w,
        std::vec![unsigned(&w.b, 1, tree.clone()), unsigned(&w.a, 2, tree)],
    );
    sign_envelope(
        &mut env,
        &wrong,
        &[w.b.key.clone(), w.a.key.clone()],
        cur(&w),
        exp(&w),
    )
    .unwrap();
    assert!(matches!(
        try_join(&w, &s, &w.b, &entries_of(&env)),
        Out::Host(_)
    ));
    assert_ne!(network_id(PASS), network_id(OTHER_PASS));
    assert_eq!(clearing(&w).get_session(&s).participants.len(), 1);
}

#[test]
fn g5_an_entry_signed_inside_the_policy_window_expires_at_the_host_after_its_ledger() {
    let w = world_real();
    on_network(&w, PASS);
    let s = open_session(&w);
    w.env.ledger().with_mut(|l| l.sequence_number = 500);
    let tree = join_tree(&w, &s, &w.b);
    let it = intent(
        &w,
        &[(&w.b, jjoin(&w, &s, &w.b)), (&w.a, jjoin(&w, &s, &w.b))],
    );
    let mut env = envelope(
        &w,
        std::vec![unsigned(&w.b, 1, tree.clone()), unsigned(&w.a, 2, tree)],
    );
    sign_envelope(
        &mut env,
        &it,
        &[w.b.key.clone(), w.a.key.clone()],
        cur(&w),
        exp(&w),
    )
    .unwrap(); // expires at 510
               // host boundary: valid AT the expiration ledger, expired one ledger later (the host rejects when ledger > expiration)
    w.env.ledger().with_mut(|l| l.sequence_number = 511);
    assert!(
        matches!(try_join(&w, &s, &w.b, &entries_of(&env)), Out::Host(_)),
        "expired at the host one ledger after its expiration"
    );
    w.env.ledger().with_mut(|l| l.sequence_number = 510);
    must(try_join(&w, &s, &w.b, &entries_of(&env)));
}

#[test]
fn g6_malformed_envelopes_and_entries_are_refused_without_partial_changes() {
    let w = world_real();
    on_network(&w, PASS);
    let s = open_session(&w);
    let tree = join_tree(&w, &s, &w.b);
    let it = intent(
        &w,
        &[(&w.b, jjoin(&w, &s, &w.b)), (&w.a, jjoin(&w, &s, &w.b))],
    );
    let ok = envelope(
        &w,
        std::vec![
            unsigned(&w.b, 1, tree.clone()),
            unsigned(&w.a, 2, tree.clone())
        ],
    );
    let both = [w.a.key.clone(), w.b.key.clone()];

    // an entry that already carries a signature is never re-signed (and the other selected entry is not half-signed either)
    let mut once = ok.clone();
    sign_envelope(
        &mut once,
        &it,
        std::slice::from_ref(&w.b.key),
        cur(&w),
        exp(&w),
    )
    .unwrap();
    let snapshot = bytes_of(&once);
    assert!(sign_envelope(&mut once, &it, &both, cur(&w), exp(&w))
        .unwrap_err()
        .contains("already carries a signature"));
    assert_eq!(bytes_of(&once), snapshot, "all-or-nothing");

    // an envelope that already has an envelope signature
    let mut with_sig = ok.clone();
    if let xdr::TransactionEnvelope::Tx(v1) = &mut with_sig {
        v1.signatures = std::vec![xdr::DecoratedSignature {
            hint: xdr::SignatureHint([0; 4]),
            signature: xdr::Signature(std::vec![0u8; 64].try_into().unwrap())
        }]
        .try_into()
        .unwrap();
    }
    assert!(sign_envelope(&mut with_sig, &it, &both, cur(&w), exp(&w)).is_err());

    // not an InvokeHostFunction transaction, and not a v1 envelope
    let mut no_invoke = ok.clone();
    if let xdr::TransactionEnvelope::Tx(v1) = &mut no_invoke {
        v1.tx.operations = std::vec![xdr::Operation {
            source_account: None,
            body: xdr::OperationBody::BumpSequence(xdr::BumpSequenceOp {
                bump_to: xdr::SequenceNumber(2)
            })
        }]
        .try_into()
        .unwrap();
    }
    assert!(sign_envelope(&mut no_invoke, &it, &both, cur(&w), exp(&w)).is_err());
    let mut v0 = xdr::TransactionEnvelope::TxV0(xdr::TransactionV0Envelope {
        tx: xdr::TransactionV0 {
            source_account_ed25519: xdr::Uint256([5; 32]),
            fee: 100,
            seq_num: xdr::SequenceNumber(1),
            time_bounds: None,
            memo: xdr::Memo::None,
            operations: std::vec![].try_into().unwrap(),
            ext: xdr::TransactionV0Ext::V0,
        },
        signatures: std::vec![].try_into().unwrap(),
    });
    assert!(sign_envelope(&mut v0, &it, &both, cur(&w), exp(&w)).is_err());

    // garbage input
    assert!(read_envelope("not base64 xdr").is_err());
    assert!(read_envelope(&write_envelope(&ok).unwrap()[..40]).is_err());
    assert_eq!(
        xdr::TransactionEnvelope::from_xdr_base64(write_envelope(&ok).unwrap(), Limits::none())
            .unwrap(),
        ok
    );
}

#[test]
fn g7_two_debtors_sign_one_settlement_through_the_signer() {
    // four participants: A and B are debtors of 10; C and D creditors (the same setup as tests/signed.rs s4)
    let w = world_real();
    on_network(&w, PASS);
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
    let it = intent(
        &w,
        &[
            (&w.a, jsettle(&w, &s, &d, &w.a, &[(&w.c, 10)])),
            (&w.b, jsettle(&w, &s, &d, &w.b, &[(&w.d, 10)])),
        ],
    );
    let mut env = envelope(
        &w,
        std::vec![
            unsigned(&w.a, 31, good_settle(&w, &s, &d, &w.a, &[(&w.c, 10)])),
            unsigned(&w.b, 32, good_settle(&w, &s, &d, &w.b, &[(&w.d, 10)]))
        ],
    );
    let rep = sign_envelope(
        &mut env,
        &it,
        &[w.a.key.clone(), w.b.key.clone()],
        cur(&w),
        exp(&w),
    )
    .unwrap();
    assert_eq!(rep.signed.len(), 2);
    must(classify(
        &w.env,
        clearing(&w).set_auths(&entries_of(&env)).try_settle(&s, &d),
    ));
    assert_eq!(
        (bal(&w, &w.a), bal(&w, &w.b), bal(&w, &w.c), bal(&w, &w.d)),
        (0, 0, 10, 10)
    );
    assert_eq!(state_of(&w, &s), State::Settled);
}

#[test]
fn g8_the_expiry_policy_boundaries_and_checked_arithmetic() {
    // current 500: valid expirations are 501 ..= 510
    assert_eq!(check_expiry(Some(500), 501), Ok(501));
    assert_eq!(
        check_expiry(Some(500), 510),
        Ok(510),
        "the accepted maximum: current + 10"
    );
    assert!(
        check_expiry(Some(500), 511).is_err(),
        "current + 11 is over the cap"
    );
    assert!(
        check_expiry(Some(500), 500).is_err(),
        "equal to the current ledger is not in the future"
    );
    assert!(check_expiry(Some(500), 499).is_err(), "already expired");
    assert!(check_expiry(Some(500), 0).is_err(), "zero");
    assert!(check_expiry(Some(500), u32::MAX).is_err());
    // the current ledger is required and sane
    assert!(
        check_expiry(None, 510).is_err(),
        "unavailable current ledger fails closed"
    );
    assert!(check_expiry(Some(0), 5).is_err(), "ledger 0 is invalid");
    // near the integer limit: no wrap, no saturation
    assert!(check_expiry(Some(u32::MAX), u32::MAX).is_err());
    assert!(
        check_expiry(Some(u32::MAX - 9), u32::MAX).is_err(),
        "current + 10 overflows u32: refused, not saturated"
    );
    assert!(
        check_expiry(Some(u32::MAX - 10), u32::MAX).is_ok()
            && check_expiry(Some(u32::MAX - 10), u32::MAX - 1).is_ok()
    );
    assert!(
        check_expiry(Some(u32::MAX - 11), u32::MAX).is_err(),
        "u32::MAX is 11 ledgers away"
    );
    assert_eq!(MAX_AUTH_LIFETIME_LEDGERS, 10);
}

#[test]
fn g9_a_rejected_expiry_never_produces_output_and_leaves_the_envelope_byte_identical() {
    let w = world_real();
    on_network(&w, PASS);
    let s = open_session(&w);
    let tree = join_tree(&w, &s, &w.b);
    let it = intent(
        &w,
        &[(&w.b, jjoin(&w, &s, &w.b)), (&w.a, jjoin(&w, &s, &w.b))],
    );
    let original = envelope(
        &w,
        std::vec![unsigned(&w.b, 1, tree.clone()), unsigned(&w.a, 2, tree)],
    );
    let bytes = bytes_of(&original);
    let c = w.env.ledger().sequence();
    let keys = [w.b.key.clone(), w.a.key.clone()];
    for (cur_v, e) in [
        (Some(c), 0),
        (Some(c), c),
        (Some(c), c + 11),
        (Some(c), u32::MAX),
        (None, c + 1),
        (Some(0), 5),
        (Some(u32::MAX), u32::MAX),
    ] {
        let mut env = original.clone();
        assert!(
            sign_envelope(&mut env, &it, &keys, cur_v, e).is_err(),
            "{cur_v:?} {e}"
        );
        assert_eq!(
            bytes_of(&env),
            bytes,
            "byte for byte unchanged: {cur_v:?} {e}"
        );
    }
    // the accepted maximum signs, and the host accepts it
    let mut ok = original.clone();
    sign_envelope(&mut ok, &it, &keys, Some(c), c + 10).unwrap();
    must(try_join(&w, &s, &w.b, &entries_of(&ok)));
}

#[test]
fn g10_unsupported_credential_kinds_and_source_account_entries_fail_closed() {
    let w = world_real();
    on_network(&w, PASS);
    let s = open_session(&w);
    let tree = join_tree(&w, &s, &w.b);
    let it = intent(&w, &[(&w.b, jjoin(&w, &s, &w.b))]);
    let base = |creds: xdr::SorobanCredentials| xdr::SorobanAuthorizationEntry {
        credentials: creds,
        root_invocation: tree.clone(),
    };
    let addr_creds = |who: &Acct| xdr::SorobanAddressCredentials {
        address: sc_addr(&who.addr),
        nonce: 1,
        signature_expiration_ledger: 0,
        signature: xdr::ScVal::Void,
    };
    let v2 = base(xdr::SorobanCredentials::AddressV2(addr_creds(&w.a)));
    let del = base(xdr::SorobanCredentials::AddressWithDelegates(
        xdr::SorobanAddressCredentialsWithDelegates {
            address_credentials: addr_creds(&w.a),
            delegates: std::vec![].try_into().unwrap(),
        },
    ));
    let src = base(xdr::SorobanCredentials::SourceAccount);
    for (name, bad) in [
        ("AddressV2", v2),
        ("AddressWithDelegates", del),
        ("SourceAccount", src),
    ] {
        // even when a supported entry for the selected key sits next to it, nothing is signed and nothing is emitted
        let mut env = envelope(&w, std::vec![unsigned(&w.b, 1, tree.clone()), bad]);
        let snapshot = bytes_of(&env);
        let err = sign_envelope(
            &mut env,
            &it,
            std::slice::from_ref(&w.b.key),
            cur(&w),
            exp(&w),
        )
        .unwrap_err();
        assert!(
            err.contains("unsupported credential kind")
                || err.contains("source-account credential"),
            "{name}: {err}"
        );
        assert_eq!(bytes_of(&env), snapshot, "{name}");
    }
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// F2: the mandatory expected intent
// ---------------------------------------------------------------------------------------------------------------------------------------------

/// the debtor A pays B 20 and C 10 in the contract's order, session 1, digest 9
struct Scenario {
    w: World,
    s: BytesN<32>,
    d: BytesN<32>,
}
fn scenario() -> Scenario {
    let w = world_real();
    on_network(&w, PASS);
    let s = sid(&w, 1);
    let d = sid(&w, 9);
    Scenario { w, s, d }
}
impl Scenario {
    fn pays(&self) -> std::vec::Vec<(&Acct, i128)> {
        ordered(&self.w, &[(&self.w.b, 20), (&self.w.c, 10)])
    }
    fn expected(&self) -> ExpectedIntent {
        let w = &self.w;
        intent(
            w,
            &[(&w.a, jsettle(w, &self.s, &self.d, &w.a, &self.pays()))],
        )
    }
    fn good(&self) -> xdr::SorobanAuthorizedInvocation {
        good_settle(&self.w, &self.s, &self.d, &self.w.a, &self.pays())
    }
    fn env_with(&self, tree: xdr::SorobanAuthorizedInvocation) -> xdr::TransactionEnvelope {
        envelope(&self.w, std::vec![unsigned(&self.w.a, 5, tree)])
    }
    /// the signer must refuse, name the reason, change nothing and emit nothing
    fn refuses(&self, name: &str, env: xdr::TransactionEnvelope, expect: &str) {
        let before = bytes_of(&env);
        let mut e = env.clone();
        let err = sign_envelope(
            &mut e,
            &self.expected(),
            std::slice::from_ref(&self.w.a.key),
            cur(&self.w),
            exp(&self.w),
        )
        .unwrap_err();
        assert!(err.contains(expect), "{name}: {err}");
        assert_eq!(bytes_of(&e), before, "{name}: byte-identical");
        assert_eq!(e, env, "{name}");
    }
}

#[test]
fn h0_the_good_settlement_tree_is_signed() {
    let sc_ = scenario();
    let w = &sc_.w;
    let mut env = sc_.env_with(sc_.good());
    let rep = sign_envelope(
        &mut env,
        &sc_.expected(),
        std::slice::from_ref(&w.a.key),
        cur(w),
        exp(w),
    )
    .unwrap();
    assert_eq!(rep.signed.len(), 1);
    assert_eq!(entries_of(&env).len(), 1);
}

#[test]
fn h1_any_deviation_of_the_settlement_tree_from_the_expected_intent_is_refused() {
    let sc_ = scenario();
    let w = &sc_.w;
    let (s, d) = (&sc_.s, &sc_.d);
    let pays = sc_.pays();
    let (p0, p1) = (pays[0], pays[1]);
    let t = |to: &Acct, a: i128| transfer_xdr(w, &w.token, &w.a, to, a);
    let good_subs = || std::vec![t(p0.0, p0.1), t(p1.0, p1.1)];
    let other_session = sid(w, 2);
    let other_digest = sid(w, 8);
    let cases: std::vec::Vec<(&str, xdr::SorobanAuthorizedInvocation)> = std::vec![
        (
            "wrong clearing contract",
            settle_xdr(w, &w.token, "settle", s, d, 30, good_subs())
        ),
        (
            "wrong function",
            settle_xdr(w, &w.clearing, "approve_settlement", s, d, 30, good_subs())
        ),
        (
            "modified session",
            settle_xdr(w, &w.clearing, "settle", &other_session, d, 30, good_subs())
        ),
        (
            "modified digest (the revision-bound digest)",
            settle_xdr(w, &w.clearing, "settle", s, &other_digest, 30, good_subs())
        ),
        (
            "modified total",
            settle_xdr(w, &w.clearing, "settle", s, d, 31, good_subs())
        ),
        (
            "wrong token contract in a transfer",
            settle_xdr(
                w,
                &w.clearing,
                "settle",
                s,
                d,
                30,
                std::vec![
                    transfer_xdr(w, &w.clearing, &w.a, p0.0, p0.1),
                    t(p1.0, p1.1)
                ]
            )
        ),
        (
            "transfer source changed",
            settle_xdr(
                w,
                &w.clearing,
                "settle",
                s,
                d,
                30,
                std::vec![transfer_xdr(w, &w.token, &w.x, p0.0, p0.1), t(p1.0, p1.1)]
            )
        ),
        (
            "transfer destination changed",
            settle_xdr(
                w,
                &w.clearing,
                "settle",
                s,
                d,
                30,
                std::vec![t(&w.x, p0.1), t(p1.0, p1.1)]
            )
        ),
        (
            "transfer amount changed",
            settle_xdr(
                w,
                &w.clearing,
                "settle",
                s,
                d,
                30,
                std::vec![t(p0.0, p0.1 - 1), t(p1.0, p1.1)]
            )
        ),
        (
            "extra transfer",
            settle_xdr(
                w,
                &w.clearing,
                "settle",
                s,
                d,
                30,
                std::vec![t(p0.0, p0.1), t(p1.0, p1.1), t(&w.x, 1)]
            )
        ),
        (
            "missing transfer",
            settle_xdr(w, &w.clearing, "settle", s, d, 30, std::vec![t(p0.0, p0.1)])
        ),
        (
            "reordered transfers",
            settle_xdr(
                w,
                &w.clearing,
                "settle",
                s,
                d,
                30,
                std::vec![t(p1.0, p1.1), t(p0.0, p0.1)]
            )
        ),
        (
            "duplicate transfer",
            settle_xdr(
                w,
                &w.clearing,
                "settle",
                s,
                d,
                30,
                std::vec![t(p0.0, p0.1), t(p0.0, p0.1), t(p1.0, p1.1)]
            )
        ),
        (
            "no transfers",
            settle_xdr(w, &w.clearing, "settle", s, d, 30, std::vec![])
        ),
        (
            "a nested sub-invocation hidden under a transfer",
            settle_xdr(
                w,
                &w.clearing,
                "settle",
                s,
                d,
                30,
                std::vec![
                    invocation(
                        "transfer",
                        &w.token,
                        std::vec![
                            sc(&w.env, &w.a.addr),
                            sc(&w.env, &p0.0.addr),
                            sc(&w.env, &p0.1)
                        ],
                        std::vec![t(&w.x, 1)]
                    ),
                    t(p1.0, p1.1)
                ]
            ),
        ),
    ];
    for (name, tree) in cases {
        sc_.refuses(
            name,
            sc_.env_with(tree),
            "does not match its expected invocation tree",
        );
    }
}

#[test]
fn h2_entry_set_errors_wrong_debtor_unexpected_missing_duplicate_and_unsigned_requirements() {
    let sc_ = scenario();
    let w = &sc_.w;
    // wrong debtor: the entry's account is B but the tree is A's
    sc_.refuses(
        "wrong debtor account",
        envelope(w, std::vec![unsigned(&w.b, 5, sc_.good())]),
        "unexpected entry",
    );
    // an entry for an account the intent does not list next to the expected one
    sc_.refuses(
        "unexpected extra entry",
        envelope(
            w,
            std::vec![unsigned(&w.a, 5, sc_.good()), unsigned(&w.c, 6, sc_.good())],
        ),
        "unexpected entry",
    );
    // the expected signer has no entry at all
    sc_.refuses(
        "missing entry",
        envelope(w, std::vec![]),
        "no entry for the expected signer",
    );
    // the same entry twice
    sc_.refuses(
        "duplicate entry",
        envelope(
            w,
            std::vec![unsigned(&w.a, 5, sc_.good()), unsigned(&w.a, 6, sc_.good())],
        ),
        "duplicates an entry",
    );
    // the requested key has no expected entry / no key / the same key twice
    let env = sc_.env_with(sc_.good());
    let mut e = env.clone();
    assert!(sign_envelope(&mut e, &sc_.expected(), &[], cur(w), exp(w))
        .unwrap_err()
        .contains("no signing key"));
    assert!(sign_envelope(
        &mut e,
        &sc_.expected(),
        &[w.a.key.clone(), w.a.key.clone()],
        cur(w),
        exp(w)
    )
    .unwrap_err()
    .contains("twice"));
    assert!(sign_envelope(
        &mut e,
        &sc_.expected(),
        std::slice::from_ref(&w.b.key),
        cur(w),
        exp(w)
    )
    .unwrap_err()
    .contains("no expected entry"));
    assert_eq!(e, env);
    // a source-account credential is unexpected
    let src = xdr::SorobanAuthorizationEntry {
        credentials: xdr::SorobanCredentials::SourceAccount,
        root_invocation: sc_.good(),
    };
    sc_.refuses(
        "source-account entry",
        envelope(w, std::vec![unsigned(&w.a, 5, sc_.good()), src]),
        "source-account credential",
    );
}

#[test]
fn h3_a_late_mismatch_after_earlier_valid_entries_leaves_no_partial_output() {
    let w = world_real();
    on_network(&w, PASS);
    let (s, d) = (sid(&w, 1), sid(&w, 9));
    let payers = [&w.a, &w.b, &w.c];
    let it = intent(
        &w,
        &payers
            .iter()
            .map(|p| (*p, jsettle(&w, &s, &d, p, &[(&w.d, 10)])))
            .collect::<std::vec::Vec<_>>(),
    );
    let good = |p: &Acct, amt: i128| unsigned(p, 7, good_settle(&w, &s, &d, p, &[(&w.d, amt)]));
    // the first two entries validate completely; the third differs only in one transfer amount
    let env = envelope(
        &w,
        std::vec![good(&w.a, 10), good(&w.b, 10), good(&w.c, 11)],
    );
    let before = bytes_of(&env);
    let mut e = env.clone();
    let keys = [w.a.key.clone(), w.b.key.clone(), w.c.key.clone()];
    assert!(sign_envelope(&mut e, &it, &keys, cur(&w), exp(&w))
        .unwrap_err()
        .contains("does not match"));
    assert_eq!(
        bytes_of(&e),
        before,
        "no entry was signed, not even the valid ones"
    );
    // and with the third entry right, all three sign
    let mut ok = envelope(
        &w,
        std::vec![good(&w.a, 10), good(&w.b, 10), good(&w.c, 10)],
    );
    assert_eq!(
        sign_envelope(&mut ok, &it, &keys, cur(&w), exp(&w))
            .unwrap()
            .signed
            .len(),
        3
    );
}

#[test]
fn h4_input_limits_depth_node_count_entry_count_and_size() {
    let w = world_real();
    on_network(&w, PASS);
    let (s, d) = (sid(&w, 1), sid(&w, 9));
    let it = intent(&w, &[(&w.a, jsettle(&w, &s, &d, &w.a, &[(&w.b, 10)]))]);
    let run = |entries: std::vec::Vec<xdr::SorobanAuthorizationEntry>| {
        let env = envelope(&w, entries);
        let before = bytes_of(&env);
        let mut e = env.clone();
        let r = sign_envelope(
            &mut e,
            &it,
            std::slice::from_ref(&w.a.key),
            cur(&w),
            exp(&w),
        );
        assert_eq!(bytes_of(&e), before);
        r.unwrap_err()
    };
    let chain = |depth: usize| {
        let mut t = invocation("transfer", &w.token, std::vec![], std::vec![]);
        for _ in 1..depth {
            t = invocation("transfer", &w.token, std::vec![], std::vec![t]);
        }
        t
    };
    // too deep (7 levels with MAX_TREE_DEPTH 6), within the XDR limit
    assert!(run(std::vec![unsigned(&w.a, 1, chain(MAX_TREE_DEPTH + 1))]).contains("deeper"));
    // too many nodes: a root with MAX_TREE_NODES children
    let wide = invocation(
        "settle",
        &w.clearing,
        std::vec![],
        (0..MAX_TREE_NODES)
            .map(|_| invocation("transfer", &w.token, std::vec![], std::vec![]))
            .collect(),
    );
    assert!(run(std::vec![unsigned(&w.a, 1, wide)]).contains("more than"));
    // too many entries
    let many: std::vec::Vec<_> = (0..MAX_AUTH_ENTRIES + 1)
        .map(|i| unsigned(&w.a, i as i64, join_tree(&w, &s, &w.b)))
        .collect();
    assert!(run(many).contains("more than"));
    // the XDR decoder itself refuses nesting far beyond any sane tree (no stack overflow), and oversized or malformed text
    let deep = envelope(&w, std::vec![unsigned(&w.a, 1, chain(400))]);
    let b64 = deep.to_xdr_base64(Limits::none()).unwrap();
    assert!(read_envelope(&b64).is_err(), "depth beyond XDR_DEPTH_LIMIT");
    assert!(read_envelope(&"A".repeat(MAX_ENVELOPE_BYTES / 3 * 4 + 16))
        .unwrap_err()
        .contains("larger than"));
    assert!(read_envelope("").is_err());
    let valid = write_envelope(&envelope(
        &w,
        std::vec![unsigned(&w.a, 1, join_tree(&w, &s, &w.b))],
    ))
    .unwrap();
    assert!(read_envelope(&valid).is_ok());
    assert!(
        read_envelope(&format!("{valid}AAAA")).is_err(),
        "trailing garbage"
    );
}

#[test]
fn h5_the_intent_itself_is_validated_strictly() {
    let w = world_real();
    let (s, d) = (sid(&w, 1), sid(&w, 9));
    let good_tree = || jsettle(&w, &s, &d, &w.a, &ordered(&w, &[(&w.b, 20), (&w.c, 10)]));
    let one = |t: Value| intent_json(PASS, &[(&w.a, t)]);
    assert!(parse_intent(&one(good_tree()), &dep(&w, PASS)).is_ok());

    // version, shape, unknown fields, unsupported types
    let mut v: Value = serde_json::from_str(&one(good_tree())).unwrap();
    v["version"] = json!(2);
    assert!(bad_intent(&w, &v.to_string()).contains("version"));
    let mut v: Value = serde_json::from_str(&one(good_tree())).unwrap();
    v["extra"] = json!(1);
    assert!(bad_intent(&w, &v.to_string()).contains("unknown field"));
    let mut v: Value = serde_json::from_str(&one(good_tree())).unwrap();
    v["entries"][0]["tree"]["args"][0]["t"] = json!("string");
    assert!(bad_intent(&w, &v.to_string()).contains("unsupported argument type"));
    let mut v: Value = serde_json::from_str(&one(good_tree())).unwrap();
    v["entries"][0]["tree"]["surprise"] = json!(true);
    assert!(bad_intent(&w, &v.to_string()).contains("unknown field"));
    assert!(bad_intent(&w, "{not json").contains("not valid JSON"));
    assert!(bad_intent(&w, &"x".repeat(MAX_JSON_BYTES + 1)).contains("larger than"));
    assert!(bad_intent(&w, &intent_json(PASS, &[])).contains("entries"));

    // contracts outside the pinned record
    let stranger = Address::generate(&w.env);
    let foreign = jtree(
        &stranger,
        "settle",
        vec![jb32(&s), jb32(&d), ji128(10)],
        vec![jtree(
            &w.token,
            "transfer",
            vec![jaddr(&w.a.addr), jaddr(&w.b.addr), ji128(10)],
            vec![],
        )],
    );
    assert!(bad_intent(&w, &one(foreign)).contains("not in the pinned deployment record"));
    let foreign_token = jtree(
        &w.clearing,
        "settle",
        vec![jb32(&s), jb32(&d), ji128(10)],
        vec![jtree(
            &stranger,
            "transfer",
            vec![jaddr(&w.a.addr), jaddr(&w.b.addr), ji128(10)],
            vec![],
        )],
    );
    assert!(bad_intent(&w, &one(foreign_token)).contains("not in the pinned deployment record"));

    // settlement semantics
    let sub = |from: &Acct, to: &Acct, a: i128| {
        jtree(
            &w.token,
            "transfer",
            vec![jaddr(&from.addr), jaddr(&to.addr), ji128(a)],
            vec![],
        )
    };
    let root = |total: i128, subs: Vec<Value>| {
        jtree(
            &w.clearing,
            "settle",
            vec![jb32(&s), jb32(&d), ji128(total)],
            subs,
        )
    };
    let ord = ordered(&w, &[(&w.b, 20), (&w.c, 10)]);
    let (first, second) = (ord[0], ord[1]);
    assert!(bad_intent(
        &w,
        &one(root(
            31,
            vec![sub(&w.a, first.0, first.1), sub(&w.a, second.0, second.1)]
        ))
    )
    .contains("sum of the transfers"));
    assert!(
        bad_intent(
            &w,
            &one(root(
                30,
                vec![sub(&w.a, second.0, second.1), sub(&w.a, first.0, first.1)]
            ))
        )
        .contains("ascending"),
        "reordered"
    );
    assert!(
        bad_intent(
            &w,
            &one(root(
                20,
                vec![sub(&w.a, first.0, 10), sub(&w.a, first.0, 10)]
            ))
        )
        .contains("ascending"),
        "duplicate payee"
    );
    assert!(
        bad_intent(&w, &one(root(10, vec![sub(&w.b, second.0, 10)]))).contains("from the signer"),
        "payer is not the signer"
    );
    assert!(bad_intent(&w, &one(root(10, vec![sub(&w.a, &w.a, 10)]))).contains("itself"));
    assert!(
        bad_intent(&w, &one(root(0, vec![sub(&w.a, first.0, 0)]))).contains("expected shape"),
        "zero total"
    );
    assert!(bad_intent(&w, &one(root(10, vec![sub(&w.a, first.0, -10)]))).contains("positive"));
    assert!(bad_intent(&w, &one(root(10, vec![]))).contains("at least one transfer"));
    assert!(
        bad_intent(
            &w,
            &one(jtree(
                &w.clearing,
                "settle",
                vec![jb32(&s), jb32(&d)],
                vec![sub(&w.a, first.0, 10)]
            ))
        )
        .contains("expected shape"),
        "missing total argument"
    );
    let nested = jtree(
        &w.token,
        "transfer",
        vec![jaddr(&w.a.addr), jaddr(&first.0.addr), ji128(10)],
        vec![sub(&w.a, second.0, 1)],
    );
    assert!(bad_intent(&w, &one(root(10, vec![nested]))).contains("only contain token.transfer"));
    let wrong_fn_sub = jtree(
        &w.token,
        "mint",
        vec![jaddr(&first.0.addr), ji128(10)],
        vec![],
    );
    assert!(
        bad_intent(&w, &one(root(10, vec![wrong_fn_sub]))).contains("only contain token.transfer")
    );
    assert!(bad_intent(
        &w,
        &one(jtree(
            &w.token,
            "transfer",
            vec![jaddr(&w.a.addr), jaddr(&w.b.addr), ji128(1)],
            vec![]
        ))
    )
    .contains("not a supported root call"));
    assert!(bad_intent(
        &w,
        &one(jtree(&w.clearing, "get_session", vec![jb32(&s)], vec![]))
    )
    .contains("not a supported signing call"));
    // encodings: canonical amounts, lowercase hex, checksum-verified addresses, depth and size
    for amt in ["+10", "010", "1e1", "1.0", " 10"] {
        let mut v: Value = serde_json::from_str(&one(good_tree())).unwrap();
        v["entries"][0]["tree"]["args"][2]["v"] = json!(amt);
        assert!(bad_intent(&w, &v.to_string()).contains("amount"), "{amt}");
    }
    let mut v: Value = serde_json::from_str(&one(good_tree())).unwrap();
    v["entries"][0]["tree"]["args"][0]["v"] = json!("A".repeat(64));
    assert!(bad_intent(&w, &v.to_string()).contains("lowercase hex"));
    let mut v: Value = serde_json::from_str(&one(good_tree())).unwrap();
    let mut a = strkey(&w.b.addr).into_bytes();
    let last = a.len() - 1;
    a[last] = if a[last] == b'A' { b'B' } else { b'A' };
    v["entries"][0]["tree"]["subs"][0]["args"][1]["v"] = json!(String::from_utf8(a).unwrap());
    assert!(bad_intent(&w, &v.to_string()).contains("checksum"));
    let mut deep = jtree(&w.token, "transfer", vec![], vec![]);
    for _ in 0..MAX_TREE_DEPTH {
        deep = jtree(&w.token, "transfer", vec![], vec![deep]);
    }
    assert!(bad_intent(&w, &one(deep)).contains("deeper"));
    let wide = jtree(
        &w.clearing,
        "settle",
        vec![],
        (0..MAX_TREE_NODES)
            .map(|_| jtree(&w.token, "transfer", vec![], vec![]))
            .collect(),
    );
    assert!(bad_intent(&w, &one(wide)).contains("more than"));
    // duplicate expected entries and signers that are not accounts
    assert!(bad_intent(
        &w,
        &intent_json(PASS, &[(&w.a, good_tree()), (&w.a, good_tree())])
    )
    .contains("duplicate"));
    let mut v: Value = serde_json::from_str(&one(good_tree())).unwrap();
    v["entries"][0]["signer"] = json!(strkey(&w.token));
    assert!(bad_intent(&w, &v.to_string()).contains("account"));
}

#[test]
fn h6_the_deployment_record_is_validated_strictly_and_holds_no_secrets() {
    let w = world_real();
    let good = dep_json(&w, PASS);
    assert!(parse_deployment(&good).is_ok());
    let mutate = |f: &dyn Fn(&mut Value)| {
        let mut v: Value = serde_json::from_str(&good).unwrap();
        f(&mut v);
        parse_deployment(&v.to_string()).unwrap_err()
    };
    assert!(mutate(&|v| v["version"] = json!(2)).contains("version"));
    assert!(mutate(&|v| v["fallback_rpc"] = json!("http://x")).contains("unknown field"));
    assert!(mutate(&|v| {
        v.as_object_mut().unwrap().remove("token");
    })
    .contains("missing"));
    assert!(mutate(&|v| v["network_passphrase"] = json!("")).contains("passphrase"));
    assert!(mutate(&|v| v["network_passphrase"] = json!("a\nb")).contains("passphrase"));
    assert!(mutate(&|v| v["clearing"] = v["token"].clone()).contains("different"));
    assert!(mutate(&|v| v["clearing"] = json!(strkey(&w.a.addr))).contains("contract"));
    assert!(mutate(&|v| v["token"] = json!("CNOTAKEY")).contains("56"));
    assert!(parse_deployment("[]").is_err());
    assert!(
        !good
            .split('"')
            .any(|tok| tok.len() == 56 && tok.starts_with('S')),
        "the record carries no secret-seed strkeys"
    );
}
