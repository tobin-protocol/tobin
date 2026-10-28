//! Preserved co-signer entries (founder-approved Option A of the signer security review, section 14): the signer signs only the entries that belong to the
//! keys it was given, after the WHOLE envelope has been matched to the expected intent. Entries of other expected signers are carried through the typed-XDR
//! decode/encode path unchanged, whatever their signature field holds. The signer does NOT verify those signatures; the Soroban host does (signature
//! validity against the network, tree, nonce and expiry; signer membership and weight; nonce use; expiry). These tests show, in the Soroban TEST HOST only:
//!   * a valid, void, garbage, empty, multi-signature, wrong-key, malformed, wrong-tree, wrong-network, altered-nonce and altered-expiry co-signer payload
//!     is preserved byte for byte and never signed by this tool, and the host accepts only the valid one;
//!   * missing, duplicate, unexpected and intent-mismatched entries (even pre-signed ones) are refused atomically.
//!
//! Not shown: a real network, a wallet, real multisig accounts or thresholds, non-canonical XDR, how the host treats unused entries, or entry order.
#![cfg(test)]
#[path = "../signer/mod.rs"]
#[allow(dead_code)]
mod signer;
mod support;
use serde_json::{json, Value};
use signer::*;
use soroban_sdk::{
    testutils::Ledger as _,
    xdr::{self, Limits, WriteXdr},
    Address, BytesN, Env, IntoVal, TryFromVal, Val,
};
use support::*;

const PASS: &str = "Standalone Network ; February 2017";
const OTHER_PASS: &str = "Test SDF Network ; September 2015";

fn cur(w: &World) -> Option<u32> {
    Some(w.env.ledger().sequence())
}
fn exp(w: &World) -> u32 {
    w.env.ledger().sequence() + MAX_AUTH_LIFETIME_LEDGERS
}
fn sc<T: IntoVal<Env, Val>>(env: &Env, t: &T) -> xdr::ScVal {
    let v: Val = t.into_val(env);
    xdr::ScVal::try_from_val(env, &v).unwrap()
}
fn sc_addr(a: &Address) -> xdr::ScAddress {
    a.into()
}
fn join_tree(w: &World, s: &BytesN<32>, joiner: &Acct) -> xdr::SorobanAuthorizedInvocation {
    xdr::SorobanAuthorizedInvocation {
        function: xdr::SorobanAuthorizedFunction::ContractFn(xdr::InvokeContractArgs {
            contract_address: sc_addr(&w.clearing),
            function_name: "join_session".try_into().unwrap(),
            args: std::vec![sc(&w.env, s), sc(&w.env, &joiner.addr)]
                .try_into()
                .unwrap(),
        }),
        sub_invocations: std::vec![].try_into().unwrap(),
    }
}
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
fn entry_bytes(e: &xdr::SorobanAuthorizationEntry) -> std::vec::Vec<u8> {
    e.to_xdr(Limits::none()).unwrap()
}
fn on_network(w: &World, passphrase: &str) {
    let id = network_id(passphrase);
    w.env.ledger().with_mut(|l| {
        l.network_id = id;
        l.sequence_number = 1000;
    });
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

// ---- intent (JSON, built from structured values) ----
fn strkey(a: &Address) -> String {
    format!("{}", a.to_string())
}
fn hex32(b: &BytesN<32>) -> String {
    b.to_array().iter().map(|x| format!("{x:02x}")).collect()
}
fn jjoin(w: &World, s: &BytesN<32>, joiner: &Acct) -> Value {
    json!({"contract": strkey(&w.clearing), "fn": "join_session", "args": [{"t": "bytes32", "v": hex32(s)}, {"t": "addr", "v": strkey(&joiner.addr)}], "subs": []})
}
fn intent(w: &World, entries: &[(&Acct, Value)]) -> ExpectedIntent {
    let dep = parse_deployment(&json!({"version": 1, "network_passphrase": PASS, "clearing": strkey(&w.clearing), "token": strkey(&w.token)}).to_string()).unwrap();
    let text = json!({"version": 1, "network_passphrase": PASS, "entries": entries.iter().map(|(a, t)| json!({"signer": strkey(&a.addr), "tree": t})).collect::<Vec<_>>()}).to_string();
    parse_intent(&text, &dep).unwrap()
}

// ---- signature payload forms ----
fn bytes_v(b: &[u8]) -> xdr::ScVal {
    xdr::ScVal::Bytes(xdr::ScBytes(b.to_vec().try_into().unwrap()))
}
fn sym(k: &str) -> xdr::ScVal {
    xdr::ScVal::Symbol(k.try_into().unwrap())
}
fn sig_map(pk: &[u8], sig: &[u8]) -> xdr::ScVal {
    let e = |k: &str, v: xdr::ScVal| xdr::ScMapEntry {
        key: sym(k),
        val: v,
    };
    xdr::ScVal::Map(Some(xdr::ScMap(
        std::vec![e("public_key", bytes_v(pk)), e("signature", bytes_v(sig))]
            .try_into()
            .unwrap(),
    )))
}
fn sig_vec(items: std::vec::Vec<xdr::ScVal>) -> xdr::ScVal {
    xdr::ScVal::Vec(Some(xdr::ScVec(items.try_into().unwrap())))
}
fn signature_of(e: &xdr::SorobanAuthorizationEntry) -> xdr::ScVal {
    let xdr::SorobanCredentials::Address(c) = &e.credentials else {
        panic!()
    };
    c.signature.clone()
}
/// (public key, signature) bytes of the single signature of a signed entry
fn sig_parts(e: &xdr::SorobanAuthorizationEntry) -> (std::vec::Vec<u8>, std::vec::Vec<u8>) {
    let xdr::ScVal::Vec(Some(v)) = signature_of(e) else {
        panic!()
    };
    let xdr::ScVal::Map(Some(m)) = &v[0] else {
        panic!()
    };
    let (xdr::ScVal::Bytes(pk), xdr::ScVal::Bytes(sg)) = (&m[0].val, &m[1].val) else {
        panic!()
    };
    (pk.0.to_vec(), sg.0.to_vec())
}
/// an entry for `who` signed with the TEST-ONLY unchecked helper, bound to `pass`, `tree`, `nonce`, `expiry`
fn presigned(
    who: &Acct,
    nonce: i64,
    tree: xdr::SorobanAuthorizedInvocation,
    expiry: u32,
    pass: &str,
) -> xdr::SorobanAuthorizationEntry {
    let mut e = unsigned(who, nonce, tree);
    sign_entry_unchecked_for_tests(&mut e, network_id(pass), expiry, &who.key).unwrap();
    e
}
fn with_fields(
    e: &xdr::SorobanAuthorizationEntry,
    nonce: Option<i64>,
    expiry: Option<u32>,
    sig: Option<xdr::ScVal>,
) -> xdr::SorobanAuthorizationEntry {
    let mut out = e.clone();
    let xdr::SorobanCredentials::Address(c) = &mut out.credentials else {
        panic!()
    };
    if let Some(n) = nonce {
        c.nonce = n;
    }
    if let Some(x) = expiry {
        c.signature_expiration_ledger = x;
    }
    if let Some(s) = sig {
        c.signature = s;
    }
    out
}

struct Co {
    w: World,
    s: BytesN<32>,
    tree: xdr::SorobanAuthorizedInvocation,
    it: ExpectedIntent,
}
/// join of B by the creator A: expected entries for B (the co-signer, whose key is NOT given to the signer) and A (the signer's own key)
fn co() -> Co {
    let w = world_real();
    on_network(&w, PASS);
    w.env.mock_all_auths();
    let s = sid(&w, 1);
    clearing(&w).create_session(&w.a.addr, &s, &w.token, &4, &16);
    let tree = join_tree(&w, &s, &w.b);
    let it = intent(
        &w,
        &[(&w.b, jjoin(&w, &s, &w.b)), (&w.a, jjoin(&w, &s, &w.b))],
    );
    Co { w, s, tree, it }
}
impl Co {
    fn envelope_with(&self, b_entry: xdr::SorobanAuthorizationEntry) -> xdr::TransactionEnvelope {
        envelope(
            &self.w,
            std::vec![b_entry, unsigned(&self.w.a, 12, self.tree.clone())],
        )
    }
    /// run the signer for A over an envelope whose co-signer entry is `b_entry`; the co-signer entry must come out untouched, A's entry must be signed,
    /// and the host's verdict on the result is checked
    fn preserved(&self, name: &str, b_entry: xdr::SorobanAuthorizationEntry, host_accepts: bool) {
        let w = &self.w;
        let original = self.envelope_with(b_entry.clone());
        let mut env = original.clone();
        let rep = sign_envelope(
            &mut env,
            &self.it,
            std::slice::from_ref(&w.a.key),
            cur(w),
            exp(w),
        )
        .unwrap_or_else(|e| panic!("{name}: the signer refused: {e}"));
        assert_eq!((rep.signed.len(), rep.preserved.len()), (1, 1), "{name}");
        let out = entries_of(&env);
        assert_eq!(
            out[0], b_entry,
            "{name}: the co-signer entry is preserved (typed equality)"
        );
        assert_eq!(
            entry_bytes(&out[0]),
            entry_bytes(&b_entry),
            "{name}: the co-signer entry is preserved byte for byte"
        );
        // the signer signed its own entry and changed nothing else in it
        let own_before = &entries_of(&original)[1];
        assert_ne!(&out[1], own_before, "{name}");
        assert_eq!(out[1].root_invocation, own_before.root_invocation, "{name}");
        let (xdr::SorobanCredentials::Address(a1), xdr::SorobanCredentials::Address(a0)) =
            (&out[1].credentials, &own_before.credentials)
        else {
            panic!()
        };
        assert_eq!(
            (a1.address.clone(), a1.nonce),
            (a0.address.clone(), a0.nonce),
            "{name}"
        );
        assert_eq!(a1.signature_expiration_ledger, exp(w), "{name}");
        // the host decides validity
        let verdict = try_join(w, &self.s, &w.b, &out);
        if host_accepts {
            must(verdict);
            assert_eq!(
                clearing(w).get_session(&self.s).participants.len(),
                2,
                "{name}"
            );
        } else {
            assert!(
                matches!(verdict, Out::Host(_)),
                "{name}: the host should reject, got {verdict:?}"
            );
            assert_eq!(
                clearing(w).get_session(&self.s).participants.len(),
                1,
                "{name}: nobody was admitted"
            );
        }
    }
    /// the signer must refuse, change nothing and leave its own entry unsigned
    fn refuses(&self, name: &str, env: xdr::TransactionEnvelope, expect: &str) {
        let w = &self.w;
        let before = bytes_of(&env);
        let mut e = env.clone();
        let err = sign_envelope(
            &mut e,
            &self.it,
            std::slice::from_ref(&w.a.key),
            cur(w),
            exp(w),
        )
        .unwrap_err();
        assert!(err.contains(expect), "{name}: {err}");
        assert_eq!(
            bytes_of(&e),
            before,
            "{name}: the envelope is byte-identical"
        );
        assert_eq!(e, env, "{name}");
    }
}

#[test]
fn c0_a_valid_cosigner_signature_is_preserved_and_the_host_accepts_the_completed_envelope() {
    let c = co();
    let w = &c.w;
    c.preserved(
        "valid",
        presigned(&w.b, 11, c.tree.clone(), exp(w), PASS),
        true,
    );
}

#[test]
fn c1_every_other_cosigner_payload_is_preserved_unchanged_never_signed_here_and_rejected_by_the_host(
) {
    let c = co();
    let w = &c.w;
    let e = exp(w);
    let valid = presigned(&w.b, 11, c.tree.clone(), e, PASS);
    let (b_pk, b_sig) = sig_parts(&valid);
    let x_pk = w.x.key.verifying_key().to_bytes().to_vec();
    let x_valid_looking = sig_parts(&presigned(&w.x, 11, c.tree.clone(), e, PASS)).1;
    // a two-signature payload, ordered by public key as the host requires; the second signer is not a signer of B's account
    let mut pair = std::vec![
        (b_pk.clone(), b_sig.clone()),
        (x_pk.clone(), x_valid_looking.clone())
    ];
    pair.sort();
    let multi = sig_vec(pair.iter().map(|(p, s)| sig_map(p, s)).collect());
    let other_tree_sig = signature_of(&presigned(&w.b, 11, join_tree(w, &c.s, &w.c), e, PASS));
    let cases: std::vec::Vec<(&str, xdr::SorobanAuthorizationEntry)> = std::vec![
        ("void (unsigned)", unsigned(&w.b, 11, c.tree.clone())),
        (
            "garbage signature bytes",
            with_fields(
                &unsigned(&w.b, 11, c.tree.clone()),
                None,
                Some(e),
                Some(sig_vec(std::vec![sig_map(&b_pk, &[7u8; 64])]))
            )
        ),
        (
            "a signature valid for a different invocation tree",
            with_fields(
                &unsigned(&w.b, 11, c.tree.clone()),
                None,
                Some(e),
                Some(other_tree_sig)
            )
        ),
        (
            "a signature made under another network passphrase",
            presigned(&w.b, 11, c.tree.clone(), e, OTHER_PASS)
        ),
        (
            "a valid signature whose nonce was altered afterwards",
            with_fields(&valid, Some(99), None, None)
        ),
        (
            "a valid signature whose expiration was altered afterwards",
            with_fields(&valid, None, Some(e + 1), None)
        ),
        (
            "an empty signature vector",
            with_fields(&valid, None, None, Some(sig_vec(std::vec![])))
        ),
        (
            "two signatures (one from a key that is not B's signer)",
            with_fields(&valid, None, None, Some(multi))
        ),
        (
            "a valid signature bytes under another public key",
            with_fields(
                &valid,
                None,
                None,
                Some(sig_vec(std::vec![sig_map(&x_pk, &b_sig)]))
            )
        ),
        (
            "a signature value of the wrong type",
            with_fields(&valid, None, None, Some(xdr::ScVal::Bool(true)))
        ),
        (
            "a vector whose element is not a map",
            with_fields(
                &valid,
                None,
                None,
                Some(sig_vec(std::vec![bytes_v(&b_sig)]))
            )
        ),
        (
            "a signature map without the signature key",
            with_fields(
                &valid,
                None,
                None,
                Some(sig_vec(std::vec![xdr::ScVal::Map(Some(xdr::ScMap(
                    std::vec![xdr::ScMapEntry {
                        key: sym("public_key"),
                        val: bytes_v(&b_pk)
                    }]
                    .try_into()
                    .unwrap()
                )))])),
            ),
        ),
    ];
    for (name, entry) in cases {
        c.preserved(name, entry, false);
    }
}

#[test]
fn c2_an_expiration_beyond_the_ten_ledger_policy_on_a_preserved_entry_is_carried_unchanged() {
    // the 10-ledger cap applies to entries THIS tool signs; it is deliberately not enforced on preserved co-signer entries (security review section 14)
    let c = co();
    let w = &c.w;
    let far = presigned(
        &w.b,
        11,
        c.tree.clone(),
        w.env.ledger().sequence() + 5_000,
        PASS,
    );
    let original = c.envelope_with(far.clone());
    let mut env = original.clone();
    sign_envelope(
        &mut env,
        &c.it,
        std::slice::from_ref(&w.a.key),
        cur(w),
        exp(w),
    )
    .unwrap();
    assert_eq!(entries_of(&env)[0], far);
    // and the tool's own entry still obeys the cap
    assert!(sign_envelope(
        &mut original.clone(),
        &c.it,
        std::slice::from_ref(&w.a.key),
        cur(w),
        w.env.ledger().sequence() + 5_000
    )
    .is_err());
}

#[test]
fn c3_missing_duplicate_unexpected_and_mismatched_entries_are_refused_atomically_even_when_presigned(
) {
    let c = co();
    let w = &c.w;
    let e = exp(w);
    let b_ok = presigned(&w.b, 11, c.tree.clone(), e, PASS);
    let own = unsigned(&w.a, 12, c.tree.clone());
    // a pre-signed co-signer entry whose tree differs from the intent: its signature is valid for ITS tree, which is not enough
    let b_wrong_tree = presigned(&w.b, 11, join_tree(w, &c.s, &w.c), e, PASS);
    c.refuses(
        "mismatched tree, valid signature for that tree",
        envelope(w, std::vec![b_wrong_tree.clone(), own.clone()]),
        "does not match its expected invocation tree",
    );
    c.refuses(
        "duplicate co-signer entry",
        envelope(w, std::vec![b_ok.clone(), b_ok.clone(), own.clone()]),
        "duplicates an entry",
    );
    c.refuses(
        "unexpected pre-signed entry for an account the intent does not list",
        envelope(
            w,
            std::vec![
                b_ok.clone(),
                own.clone(),
                presigned(&w.c, 13, c.tree.clone(), e, PASS)
            ],
        ),
        "unexpected entry",
    );
    c.refuses(
        "missing co-signer entry",
        envelope(w, std::vec![own.clone()]),
        "no entry for the expected signer",
    );
    c.refuses(
        "missing own entry",
        envelope(w, std::vec![b_ok.clone()]),
        "no entry for the expected signer",
    );
    // the signer's own entry already carries a signature: refused, nothing is re-signed
    c.refuses(
        "own entry already signed",
        envelope(
            w,
            std::vec![b_ok.clone(), presigned(&w.a, 12, c.tree.clone(), e, PASS)],
        ),
        "already carries a signature",
    );
    // an invalid entry that comes AFTER the signer's own valid entry has already been examined
    c.refuses(
        "late mismatch after the signer's own entry",
        envelope(w, std::vec![own.clone(), b_wrong_tree.clone()]),
        "does not match",
    );
    c.refuses(
        "late unexpected entry after both expected entries",
        envelope(
            w,
            std::vec![
                own.clone(),
                b_ok.clone(),
                presigned(&w.c, 13, c.tree.clone(), e, PASS)
            ],
        ),
        "unexpected entry",
    );
    // a credential kind the signer does not support, next to otherwise valid entries
    let v2 = xdr::SorobanAuthorizationEntry {
        credentials: xdr::SorobanCredentials::AddressV2(xdr::SorobanAddressCredentials {
            address: sc_addr(&w.c.addr),
            nonce: 1,
            signature_expiration_ledger: 0,
            signature: xdr::ScVal::Void,
        }),
        root_invocation: c.tree.clone(),
    };
    c.refuses(
        "unsupported credential kind among valid entries",
        envelope(w, std::vec![b_ok, own, v2]),
        "unsupported credential kind",
    );
}
