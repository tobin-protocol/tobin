//! The MVP-1 digests (obligation commitment, proposal digest): the contract's canonical bytes are compared with bytes built here by an
//! independent hand-written encoder that follows the layout of the contract design (CD section 5), from the logical inputs only.
//! This is a same-author second implementation inside the test, NOT an independent third-party implementation, and the digest bytes are not
//! founder-approved yet (DB-09): these tests pin the working version 1 so that a change is deliberate.
#![cfg(test)]
mod support;
use soroban_sdk::BytesN;
use support::*;

/// obligation_bytes from logical inputs; participants and obligations are sorted here, whatever order they are given in
fn expected_oc_bytes(
    w: &World,
    s: &BytesN<32>,
    token: &soroban_sdk::Address,
    parts: &[&Acct],
    obs: &[(u8, &Acct, &Acct, i128)],
) -> std::vec::Vec<u8> {
    let mut v = header(w, "TOBIN-MVP1/OBLIGATIONS/v2", s, token);
    let mut ps: std::vec::Vec<std::vec::Vec<u8>> =
        parts.iter().map(|p| xkey(&w.env, &p.addr)).collect();
    ps.sort();
    v.extend_from_slice(&(ps.len() as u32).to_be_bytes());
    for p in &ps {
        put_addr(&mut v, p);
    }
    let mut os = obs.to_vec();
    os.sort_by_key(|o| o.0);
    v.extend_from_slice(&(os.len() as u32).to_be_bytes());
    for (id, d, c, amt) in os {
        v.extend_from_slice(&[id; 32]);
        put_addr(&mut v, &xkey(&w.env, &d.addr));
        put_addr(&mut v, &xkey(&w.env, &c.addr));
        v.extend_from_slice(&amt.to_be_bytes());
    }
    v
}

#[test]
fn the_contracts_bytes_and_digests_equal_the_independent_encoder() {
    let w = world();
    let s = readme_session(&w, 1, &w.c);
    let parts = [&w.a, &w.b, &w.c];
    let obs = [
        (1u8, &w.a, &w.b, 100i128),
        (2, &w.b, &w.c, 80),
        (3, &w.c, &w.a, 70),
    ];
    let want = expected_oc_bytes(&w, &s, &w.token, &parts, &obs);
    assert_eq!(to_vec(&clearing(&w).commitment_bytes(&s)), want);
    let oc = clearing(&w).get_commitment(&s);
    assert_eq!(oc, sha(&w, &want));
    let d = propose_digest(&w, &s, &w.a, &readme_plan(&w));
    let want_p = expected_pd_bytes(
        &w,
        &s,
        &w.token,
        &oc,
        1,
        &[(&w.a, &w.b, 20), (&w.a, &w.c, 10)],
    );
    assert_eq!(to_vec(&clearing(&w).proposal_bytes(&s)), want_p);
    assert_eq!(d, sha(&w, &want_p));
    println!("README obligation commitment: {}", hex(&oc.to_array()));
    println!("README proposal digest:       {}", hex(&d.to_array()));
}

fn hex(b: &[u8]) -> std::string::String {
    b.iter().map(|x| format!("{x:02x}")).collect()
}

#[test]
fn admission_order_and_submission_order_do_not_change_the_bytes() {
    let w = world();
    // same logical session content, different orders of joining and of submitting obligations
    let s1 = sid(&w, 1);
    must(create(&w, &w.a, &s1, 4, 16));
    for p in [&w.b, &w.c, &w.d] {
        must(join(&w, &s1, p, &w.a));
    }
    for (id, d, c, amt) in [
        (1u8, &w.a, &w.c, 10i128),
        (2, &w.b, &w.d, 10),
        (3, &w.d, &w.a, 4),
    ] {
        must(submit(&w, &s1, &ob(&w, id, d, c, amt)));
    }
    must(finalize(&w, &s1, &w.d));
    let s2 = sid(&w, 2);
    must(create(&w, &w.a, &s2, 4, 16));
    for p in [&w.d, &w.b, &w.c] {
        must(join(&w, &s2, p, &w.a));
    }
    for (id, d, c, amt) in [
        (3u8, &w.d, &w.a, 4i128),
        (1, &w.a, &w.c, 10),
        (2, &w.b, &w.d, 10),
    ] {
        must(submit(&w, &s2, &ob(&w, id, d, c, amt)));
    }
    must(finalize(&w, &s2, &w.a));
    let parts = [&w.a, &w.b, &w.c, &w.d];
    let obs = [
        (1u8, &w.a, &w.c, 10i128),
        (2, &w.b, &w.d, 10),
        (3, &w.d, &w.a, 4),
    ];
    for s in [&s1, &s2] {
        assert_eq!(
            to_vec(&clearing(&w).commitment_bytes(s)),
            expected_oc_bytes(&w, s, &w.token, &parts, &obs)
        );
    }
    // the two sessions differ only in the session id, so only that field differs between the two byte strings
    let (b1, b2) = (
        to_vec(&clearing(&w).commitment_bytes(&s1)),
        to_vec(&clearing(&w).commitment_bytes(&s2)),
    );
    assert_eq!(b1.len(), b2.len());
    let differing: std::vec::Vec<usize> = (0..b1.len()).filter(|&i| b1[i] != b2[i]).collect();
    assert!(
        differing
            .iter()
            .all(|&i| (1 + 25 + 4 + 32 + 32..1 + 25 + 4 + 32 + 32 + 32).contains(&i)),
        "{differing:?}"
    );
}

#[test]
fn every_bound_field_changes_the_commitment() {
    let w = world();
    let other_token = w.env.register(
        tobin_test_token::TobinTestToken,
        (
            w.minter.addr.clone(),
            5i128,
            7u32,
            soroban_sdk::String::from_str(&w.env, "O"),
            soroban_sdk::String::from_str(&w.env, "O"),
        ),
    );
    // base: A owes B 10 (obligation id 1), participants A, B
    let build = |n: u8,
                 token: &soroban_sdk::Address,
                 extra_participant: bool,
                 id: u8,
                 d: &Acct,
                 c: &Acct,
                 amt: i128| {
        let s = sid(&w, n);
        must(create_as(&w, &w.a, &s, token, 4, 16, &[&w.a.addr]));
        must(join(&w, &s, &w.b, &w.a));
        if extra_participant {
            must(join(&w, &s, &w.c, &w.a));
        }
        must(submit(&w, &s, &ob(&w, id, d, c, amt)));
        must(finalize(&w, &s, &w.a));
        clearing(&w).get_commitment(&s)
    };
    let base = build(1, &w.token, false, 1, &w.a, &w.b, 10);
    let variants = [
        ("session id", build(2, &w.token, false, 1, &w.a, &w.b, 10)),
        (
            "token",
            build(1 + 10, &other_token, false, 1, &w.a, &w.b, 10),
        ),
        (
            "participant set",
            build(3, &w.token, true, 1, &w.a, &w.b, 10),
        ),
        (
            "obligation id",
            build(4, &w.token, false, 2, &w.a, &w.b, 10),
        ),
        ("amount", build(5, &w.token, false, 1, &w.a, &w.b, 11)),
        (
            "debtor and creditor swapped",
            build(6, &w.token, false, 1, &w.b, &w.a, 10),
        ),
    ];
    for (name, v) in &variants {
        assert!(*v != base, "{name}");
    }
    for i in 0..variants.len() {
        for j in i + 1..variants.len() {
            assert!(
                variants[i].1 != variants[j].1,
                "{} vs {}",
                variants[i].0,
                variants[j].0
            );
        }
    }
}

#[test]
fn the_proposal_digest_binds_the_commitment_and_the_exact_list() {
    let w = world();
    let s = four_session(&w, 1);
    let oc = clearing(&w).get_commitment(&s);
    let p1 = plan(&w, &[(&w.a, &w.c, 10), (&w.b, &w.d, 10)]);
    let p2 = plan(&w, &[(&w.a, &w.d, 10), (&w.b, &w.c, 10)]);
    let d1 = propose_digest(&w, &s, &w.a, &p1);
    let b1 = to_vec(&clearing(&w).proposal_bytes(&s));
    let d2 = propose_digest(&w, &s, &w.a, &p2);
    assert!(d1 != d2);
    assert_eq!(
        clearing(&w).get_commitment(&s),
        oc,
        "the obligation commitment does not change with the proposal"
    );
    // the bytes of the first proposal were exactly the independent encoder's output, with the commitment embedded unchanged
    assert_eq!(
        b1,
        expected_pd_bytes(
            &w,
            &s,
            &w.token,
            &oc,
            1,
            &[(&w.a, &w.c, 10), (&w.b, &w.d, 10)]
        )
    );
    assert_eq!(
        to_vec(&clearing(&w).proposal_bytes(&s)),
        expected_pd_bytes(
            &w,
            &s,
            &w.token,
            &oc,
            2,
            &[(&w.a, &w.d, 10), (&w.b, &w.c, 10)]
        )
    );
    // a different session with identical content has a different proposal digest, because the session id is bound
    let s2 = four_session(&w, 2);
    let d1b = propose_digest(&w, &s2, &w.a, &p1);
    assert!(d1b != d1);
}

#[test]
fn the_two_digests_are_domain_separated_and_versioned() {
    let w = world();
    let s = readme_session(&w, 1, &w.c);
    let d = propose_digest(&w, &s, &w.a, &readme_plan(&w));
    let (ob_bytes, pr_bytes) = (
        to_vec(&clearing(&w).commitment_bytes(&s)),
        to_vec(&clearing(&w).proposal_bytes(&s)),
    );
    let tag_o = b"TOBIN-MVP1/OBLIGATIONS/v2";
    let tag_p = b"TOBIN-MVP1/SETTLEMENT/v2";
    assert_eq!(
        (ob_bytes[0] as usize, &ob_bytes[1..1 + tag_o.len()]),
        (tag_o.len(), &tag_o[..])
    );
    assert_eq!(
        (pr_bytes[0] as usize, &pr_bytes[1..1 + tag_p.len()]),
        (tag_p.len(), &tag_p[..])
    );
    // the version field follows the tag in both
    assert_eq!(
        &ob_bytes[1 + tag_o.len()..5 + tag_o.len()],
        &2u32.to_be_bytes()
    );
    assert_eq!(
        &pr_bytes[1 + tag_p.len()..5 + tag_p.len()],
        &2u32.to_be_bytes()
    );
    assert!(clearing(&w).get_commitment(&s) != d);
    // the old single-digest tag of the superseded Phase B layout, and anything v0.2, appear nowhere
    for b in [&ob_bytes, &pr_bytes] {
        assert!(!b.windows(24).any(|x| x == b"TOBIN-MVP1/COMMITMENT/v1"));
        assert!(
            !b.windows(24).any(|x| x == b"TOBIN-MVP1/SETTLEMENT/v1"),
            "the superseded version-1 settlement tag is not used"
        );
        assert!(
            !b.windows(25).any(|x| x == b"TOBIN-MVP1/OBLIGATIONS/v1"),
            "the superseded version-1 obligations tag is not used"
        );
    }
}

#[test]
fn the_empty_proposal_has_a_defined_encoding() {
    let w = world();
    let s = sid(&w, 1);
    must(create(&w, &w.a, &s, 3, 5));
    must(join(&w, &s, &w.b, &w.a));
    must(submit(&w, &s, &ob(&w, 1, &w.a, &w.b, 5)));
    must(submit(&w, &s, &ob(&w, 2, &w.b, &w.a, 5)));
    must(finalize(&w, &s, &w.a));
    let oc = clearing(&w).get_commitment(&s);
    let d = propose_digest(&w, &s, &w.a, &raw_plan(&w, &[]));
    let want = expected_pd_bytes(&w, &s, &w.token, &oc, 1, &[]);
    assert_eq!(to_vec(&clearing(&w).proposal_bytes(&s)), want);
    assert_eq!(
        &want[want.len() - 4..],
        &0u32.to_be_bytes(),
        "an empty collection is a zero count and nothing else"
    );
    assert_eq!(d, sha(&w, &want));
}
