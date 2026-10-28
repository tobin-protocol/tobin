//! Settlement: debtor authorization, open submission, atomicity and rollback, retry, exactly-once, the no-transfer path, corrupt state.
//! Host tests only (soroban-env-host 29, native contracts, the custom TobinTestToken). Nothing here touches a wallet, a transaction envelope
//! or a network.
#![cfg(test)]
mod support;
use soroban_sdk::{testutils::Events as _, vec, BytesN, IntoVal, Symbol, Val};
use support::*;
use tobin_clearing_v1::{Approval, Error, Instruction, Proposal, State};

/// Four participants (A,B debtors of 10; C,D creditors of 10), approved plan p1 = A->C 10, B->D 10; A and B funded with `fa`, `fb`.
fn approved_four(
    w: &World,
    n: u8,
    fa: i128,
    fb: i128,
) -> (BytesN<32>, BytesN<32>, soroban_sdk::Vec<Instruction>) {
    let s = four_session(w, n);
    if fa > 0 {
        mint(w, &w.a, fa);
    }
    if fb > 0 {
        mint(w, &w.b, fb);
    }
    let p = plan(w, &[(&w.a, &w.c, 10), (&w.b, &w.d, 10)]);
    let d = propose_digest(w, &s, &w.a, &p);
    approve_all(w, &s, &d);
    assert_eq!(state_of(w, &s), State::Approved);
    (s, d, p)
}

#[test]
fn the_readme_settlement_moves_exactly_the_net_amounts_atomically() {
    let w = world();
    let s = readme_session(&w, 1, &w.c);
    mint(&w, &w.a, 100);
    let good = readme_plan(&w);
    let d = propose_digest(&w, &s, &w.b, &good);
    approve_all(&w, &s, &d);
    let supply = token(&w).total_supply();
    must(settle(&w, &s, &d, &good));
    // events and resources describe the most recent invocation only, so read them before any query
    assert_eq!(clearing_events(&w), 1, "exactly one Settled event");
    println!(
        "README settlement resources (host test; native or Wasm per environment): {:?}",
        w.env.cost_estimate().resources()
    );
    assert_eq!((bal(&w, &w.a), bal(&w, &w.b), bal(&w, &w.c)), (70, 20, 10));
    assert_eq!(
        token(&w).balance(&w.clearing),
        0,
        "no escrow: the clearing contract never holds the token"
    );
    assert_eq!(token(&w).total_supply(), supply);
    assert_eq!(state_of(&w, &s), State::Settled);
    let r = clearing(&w).get_settlement(&s);
    assert_eq!((r.digest, r.total_moved, r.instruction_count), (d, 30, 2));
}

#[test]
fn only_the_debtors_authorize_and_the_submitter_has_no_role() {
    let w = world();
    let (s, d, p) = approved_four(&w, 1, 10, 10);
    must(settle(&w, &s, &d, &p));
    // the authorizations the host recorded for this settlement belong to the two debtors only: not to the creditors, the other approvers,
    // the creator, nor to any submitter (the function has no submitter argument at all)
    let who: std::vec::Vec<_> = w.env.auths().into_iter().map(|(a, _)| a).collect();
    assert_eq!(who.len(), 2);
    assert!(who.contains(&w.a.addr) && who.contains(&w.b.addr));
    assert_eq!(
        (bal(&w, &w.a), bal(&w, &w.b), bal(&w, &w.c), bal(&w, &w.d)),
        (0, 0, 10, 10)
    );
}

#[test]
fn a_missing_or_wrong_debtor_authorization_fails_and_changes_nothing() {
    let w = world();
    let (s, d, p) = approved_four(&w, 1, 10, 10);
    let good = good_signs(&w, &s, &d, &p);
    let mut flipped = d.to_array();
    flipped[31] ^= 1;
    let flipped = BytesN::from_array(&w.env, &flipped);
    type Mutation = (
        &'static str,
        fn(&mut std::vec::Vec<Sign>, &World, &BytesN<32>),
    );
    let cases: std::vec::Vec<Mutation> = std::vec![
        ("no authorization at all", |g, _, _| g.clear()),
        ("only one of two debtors", |g, _, _| {
            g.remove(1);
        }),
        ("a debtor states a different total", |g, _, _| g[0].total +=
            1),
        ("a debtor states a smaller total", |g, _, _| g[1].total -= 1),
        ("a debtor signs another digest", |g, _, f| g[0].digest =
            f.clone()),
        ("a debtor authorizes a larger transfer", |g, _, _| g[0]
            .transfers[0]
            .2 +=
            1),
        ("a debtor authorizes a smaller transfer", |g, _, _| g[1]
            .transfers[0]
            .2 -=
            1),
        ("a debtor authorizes another payee", |g, w, _| g[0]
            .transfers[0]
            .1 =
            w.b.addr.clone()),
        ("a debtor omits its transfer sub-invocation", |g, _, _| g[0]
            .transfers
            .clear()),
        ("a bystander signs in place of a debtor", |g, w, _| g[0]
            .who =
            w.x.addr.clone()),
    ];
    for (name, mutate) in cases {
        let mut signs = good_signs(&w, &s, &d, &p);
        mutate(&mut signs, &w, &flipped);
        let out = settle_with(&w, &s, &d, &signs);
        assert!(out.is_host_auth(), "{name}: {out:?}");
        assert_eq!(
            (bal(&w, &w.a), bal(&w, &w.b), bal(&w, &w.c), bal(&w, &w.d)),
            (10, 10, 0, 0),
            "{name}"
        );
        assert_eq!(state_of(&w, &s), State::Approved, "{name}");
        assert!(clearing(&w).try_get_settlement(&s).is_err(), "{name}");
    }
    // authorizations made for another session are rejected
    let other = sid(&w, 2);
    let mut for_other = good_signs(&w, &s, &d, &p);
    for g in for_other.iter_mut() {
        g.total += 0;
    }
    let out = settle_with(&w, &other, &d, &for_other);
    assert_eq!(out, Out::Contract(Error::SessionNotFound));
    // the same debtors, correctly authorized, settle
    must(settle_with(&w, &s, &d, &good));
}

#[test]
fn a_later_transfer_that_fails_reverts_the_earlier_transfers_the_state_and_the_event() {
    let w = world();
    // A can pay, B cannot: A->C 10 succeeds, then B->D 10 fails with the token's insufficient-balance error (a token error, passed through)
    let (s, d, p) = approved_four(&w, 1, 10, 5);
    let supply = token(&w).total_supply();
    let out = settle(&w, &s, &d, &p);
    println!("later-transfer failure outcome: {out:?}");
    assert!(
        matches!(&out, Out::Host(c) if c.contains("Contract, #102")),
        "{out:?}"
    );
    assert_eq!(
        (bal(&w, &w.a), bal(&w, &w.b), bal(&w, &w.c), bal(&w, &w.d)),
        (10, 5, 0, 0),
        "A->C reverted"
    );
    assert_eq!(
        state_of(&w, &s),
        State::Approved,
        "the SETTLED marker reverted"
    );
    assert!(
        clearing(&w).try_get_settlement(&s).is_err(),
        "no terminal record"
    );
    assert_eq!(clearing_events(&w), 0, "no event from a failed settlement");
    assert_eq!(token(&w).total_supply(), supply);
    // fix the cause, retry: exactly one success
    mint(&w, &w.b, 5);
    must(settle(&w, &s, &d, &p));
    assert_eq!(
        (bal(&w, &w.a), bal(&w, &w.b), bal(&w, &w.c), bal(&w, &w.d)),
        (0, 0, 10, 10)
    );
    assert_eq!(settle(&w, &s, &d, &p), Out::Contract(Error::AlreadySettled));
}

#[test]
fn a_failure_at_the_first_or_the_last_transfer_also_reverts_everything() {
    let w = world();
    // first transfer fails: nobody has funds
    let (s, d, p) = approved_four(&w, 1, 0, 0);
    assert!(matches!(settle(&w, &s, &d, &p), Out::Host(_)));
    assert_eq!((bal(&w, &w.a), bal(&w, &w.c)), (0, 0));
    assert_eq!(state_of(&w, &s), State::Approved);
    // last of four transfers fails: B can pay only the first of its two transfers
    let w = world();
    let s = four_session(&w, 2);
    mint(&w, &w.a, 10);
    mint(&w, &w.b, 5);
    let p = plan(
        &w,
        &[
            (&w.a, &w.c, 5),
            (&w.a, &w.d, 5),
            (&w.b, &w.c, 5),
            (&w.b, &w.d, 5),
        ],
    );
    let d = propose_digest(&w, &s, &w.b, &p);
    approve_all(&w, &s, &d);
    assert!(matches!(settle(&w, &s, &d, &p), Out::Host(_)));
    assert_eq!(
        (bal(&w, &w.a), bal(&w, &w.b), bal(&w, &w.c), bal(&w, &w.d)),
        (10, 5, 0, 0)
    );
    assert_eq!(state_of(&w, &s), State::Approved);
    assert_eq!(clearing_events(&w), 0);
}

#[test]
fn a_session_settles_once_and_cannot_be_reopened() {
    let w = world();
    let (s, d, p) = approved_four(&w, 1, 10, 10);
    must(settle(&w, &s, &d, &p));
    // re-funded debtors with fresh valid authorizations still cannot move anything again
    mint(&w, &w.a, 10);
    mint(&w, &w.b, 10);
    assert_eq!(settle(&w, &s, &d, &p), Out::Contract(Error::AlreadySettled));
    assert_eq!(
        (bal(&w, &w.a), bal(&w, &w.b), bal(&w, &w.c), bal(&w, &w.d)),
        (10, 10, 10, 10)
    );
    // and nothing else changes a settled session
    assert_eq!(
        propose(
            &w,
            &s,
            &w.a,
            &plan(&w, &[(&w.a, &w.d, 10), (&w.b, &w.c, 10)])
        ),
        Out::Contract(Error::WrongState)
    );
    assert_eq!(approve(&w, &s, &w.a, &d), Out::Contract(Error::WrongState));
    assert_eq!(join(&w, &s, &w.x, &w.a), Out::Contract(Error::WrongState));
    assert_eq!(
        submit(&w, &s, &ob(&w, 9, &w.a, &w.b, 1)),
        Out::Contract(Error::WrongState)
    );
    assert_eq!(finalize(&w, &s, &w.a), Out::Contract(Error::WrongState));
    assert_eq!(state_of(&w, &s), State::Settled);
}

#[test]
fn settlement_is_bound_to_the_current_proposal() {
    let w = world();
    let (s, d1, p1) = approved_four(&w, 1, 10, 10);
    let signed_for_d1 = good_signs(&w, &s, &d1, &p1);
    // a replacement is proposed and approved: the debtors had signed for the old digest
    let p2 = plan(&w, &[(&w.a, &w.d, 10), (&w.b, &w.c, 10)]);
    let d2 = propose_digest(&w, &s, &w.c, &p2);
    approve_all(&w, &s, &d2);
    assert_eq!(
        settle_with(&w, &s, &d1, &signed_for_d1),
        Out::Contract(Error::DigestMismatch)
    );
    assert!(
        settle_with(&w, &s, &d2, &signed_for_d1).is_host_auth(),
        "entries for the old digest do not authorize the new one"
    );
    assert_eq!((bal(&w, &w.a), bal(&w, &w.b)), (10, 10));
    must(settle(&w, &s, &d2, &p2)); // new signatures for the new digest
    assert_eq!(
        (bal(&w, &w.a), bal(&w, &w.b), bal(&w, &w.c), bal(&w, &w.d)),
        (0, 0, 10, 10)
    );
    // A paid D and B paid C under the replacement plan: the executed list is the stored current proposal
    assert_eq!(clearing(&w).get_proposal(&s).instructions, p2);
}

#[test]
fn settlement_before_every_approval_or_without_a_proposal_is_refused() {
    let w = world();
    let s = four_session(&w, 1);
    mint(&w, &w.a, 10);
    mint(&w, &w.b, 10);
    let p = plan(&w, &[(&w.a, &w.c, 10), (&w.b, &w.d, 10)]);
    let any = oid(&w, 7);
    assert_eq!(
        settle_with(&w, &s, &any, &[]),
        Out::Contract(Error::NoProposal)
    );
    let d = propose_digest(&w, &s, &w.a, &p);
    assert_eq!(
        settle(&w, &s, &d, &p),
        Out::Contract(Error::MissingApproval)
    );
    for who in [&w.a, &w.b, &w.c] {
        let _ = approve_bool(&w, &s, who, &d);
    }
    assert_eq!(
        settle(&w, &s, &d, &p),
        Out::Contract(Error::MissingApproval),
        "one participant has not approved"
    );
    assert_eq!(
        settle_with(&w, &sid(&w, 99), &d, &[]),
        Out::Contract(Error::SessionNotFound)
    );
    assert_eq!((bal(&w, &w.a), bal(&w, &w.c)), (10, 0));
    assert!(approve_bool(&w, &s, &w.d, &d));
    // a digest argument that is not the current one is refused even when fully approved
    assert_eq!(
        settle_with(&w, &s, &any, &[]),
        Out::Contract(Error::DigestMismatch)
    );
    must(settle(&w, &s, &d, &p));
}

#[test]
fn all_zero_nets_complete_through_the_no_transfer_path() {
    let w = world();
    let s = sid(&w, 1);
    must(create(&w, &w.a, &s, 3, 5));
    must(join(&w, &s, &w.b, &w.a));
    must(submit(&w, &s, &ob(&w, 1, &w.a, &w.b, 5)));
    must(submit(&w, &s, &ob(&w, 2, &w.b, &w.a, 5)));
    must(finalize(&w, &s, &w.b));
    // the only valid plan is the empty list; any transfer would introduce value
    assert_eq!(
        propose(&w, &s, &w.a, &plan(&w, &[(&w.a, &w.b, 5)])),
        Out::Contract(Error::FlowMismatch)
    );
    let none = raw_plan(&w, &[]);
    let d = propose_digest(&w, &s, &w.a, &none);
    // an identical re-proposal is accepted and advances the revision, so its digest differs (EQ-05); the earlier digest is dead
    let d_old = d;
    let d = propose_digest(&w, &s, &w.b, &none);
    assert!(d != d_old);
    assert_eq!(clearing(&w).get_proposal(&s).revision, 2);
    assert_eq!(
        approve(&w, &s, &w.a, &d_old),
        Out::Contract(Error::DigestMismatch)
    );
    // approvals are still required of every admitted participant
    assert_eq!(
        settle_with(&w, &s, &d, &[]),
        Out::Contract(Error::MissingApproval)
    );
    assert!(!approve_bool(&w, &s, &w.a, &d));
    assert_eq!(
        settle_with(&w, &s, &d, &[]),
        Out::Contract(Error::MissingApproval)
    );
    assert!(approve_bool(&w, &s, &w.b, &d));
    assert_eq!(state_of(&w, &s), State::Approved);
    // any caller; no debtor, so no debit authorization and no token call
    must(settle_with(&w, &s, &d, &[]));
    assert_eq!(
        w.env
            .events()
            .all()
            .filter_by_contract(&w.token)
            .events()
            .len(),
        0,
        "the token was not called"
    );
    assert_eq!(clearing_events(&w), 1);
    assert_eq!(state_of(&w, &s), State::Settled);
    let r = clearing(&w).get_settlement(&s);
    assert_eq!(
        (r.total_moved, r.instruction_count, r.digest),
        (0, 0, d.clone())
    );
    assert_eq!(token(&w).total_supply(), 0);
    // it cannot complete twice and the session cannot be reopened
    assert_eq!(
        settle_with(&w, &s, &d, &[]),
        Out::Contract(Error::AlreadySettled)
    );
    assert_eq!(
        propose(&w, &s, &w.a, &none),
        Out::Contract(Error::WrongState)
    );
}

fn key(w: &World, name: &str, s: &BytesN<32>) -> soroban_sdk::Vec<Val> {
    vec![
        &w.env,
        Symbol::new(&w.env, name).into_val(&w.env),
        s.into_val(&w.env),
    ]
}

#[test]
fn corrupted_state_fails_closed() {
    let w = world();
    // an APPROVED session whose approval set has vanished
    let (s, d, p) = approved_four(&w, 1, 10, 10);
    w.env.as_contract(&w.clearing, || {
        w.env
            .storage()
            .persistent()
            .remove(&key(&w, "Approvals", &s))
    });
    assert_eq!(settle(&w, &s, &d, &p), Out::Contract(Error::CorruptState));
    // an APPROVED session whose proposal has vanished
    let (s2, d2, p2) = approved_four(&w, 2, 10, 10);
    w.env.as_contract(&w.clearing, || {
        w.env
            .storage()
            .persistent()
            .remove(&key(&w, "Proposal", &s2))
    });
    assert_eq!(
        settle(&w, &s2, &d2, &p2),
        Out::Contract(Error::CorruptState)
    );
    assert_eq!(
        (bal(&w, &w.a), bal(&w, &w.b), bal(&w, &w.c), bal(&w, &w.d)),
        (20, 20, 0, 0)
    );
}

#[test]
fn a_failed_settlement_emits_no_event_and_a_success_emits_one() {
    let w = world();
    let (s, d, p) = approved_four(&w, 1, 10, 0);
    assert!(matches!(settle(&w, &s, &d, &p), Out::Host(_))); // B has nothing
    assert_eq!(clearing_events(&w), 0);
    mint(&w, &w.b, 10);
    must(settle(&w, &s, &d, &p));
    assert_eq!(clearing_events(&w), 1);
}

#[test]
fn settle_revalidates_a_stored_proposal_even_when_its_digest_is_consistent() {
    // Defense in depth (EQ-11): storage is corrupted so that the stored proposal is INVALID (B's debt is missing) but its stored digest
    // is the correct digest of those bytes and every participant "approved" that digest. Only the re-validation in settle catches it.
    let w = world();
    let (s, _d, _p) = approved_four(&w, 1, 10, 10);
    let bad = plan(&w, &[(&w.a, &w.c, 10)]);
    let oc = clearing(&w).get_commitment(&s);
    let bd = sha(
        &w,
        &expected_pd_bytes(&w, &s, &w.token, &oc, 9, &[(&w.a, &w.c, 10)]),
    );
    let parts = clearing(&w).get_session(&s).participants;
    w.env.as_contract(&w.clearing, || {
        let st = w.env.storage().persistent();
        st.set(
            &key(&w, "Proposal", &s),
            &Proposal {
                digest: bd.clone(),
                instructions: bad.clone(),
                proposer: w.a.addr.clone(),
                revision: 9,
            },
        );
        let mut ap = soroban_sdk::Vec::new(&w.env);
        for p in parts.iter() {
            ap.push_back(Approval {
                participant: p,
                digest: bd.clone(),
            });
        }
        st.set(&key(&w, "Approvals", &s), &ap);
    });
    assert_eq!(
        settle(&w, &s, &bd, &bad),
        Out::Contract(Error::CorruptState)
    );
    assert_eq!(
        (bal(&w, &w.a), bal(&w, &w.b), bal(&w, &w.c), bal(&w, &w.d)),
        (10, 10, 0, 0)
    );
    assert_eq!(state_of(&w, &s), State::Approved);
}

#[test]
fn revision_overflow_fails_atomically_and_leaves_proposal_revision_and_approvals_untouched() {
    let w = world();
    let (s, d, p) = approved_four(&w, 1, 10, 10);
    // the revision of the stored proposal is forced to u32::MAX (no honest path reaches it), with the matching digest and all approvals
    let oc = clearing(&w).get_commitment(&s);
    let ins = [(&w.a, &w.c, 10), (&w.b, &w.d, 10)];
    let dmax = sha(
        &w,
        &expected_pd_bytes(&w, &s, &w.token, &oc, u32::MAX, &ins),
    );
    let parts = clearing(&w).get_session(&s).participants;
    w.env.as_contract(&w.clearing, || {
        let st = w.env.storage().persistent();
        st.set(
            &key(&w, "Proposal", &s),
            &Proposal {
                digest: dmax.clone(),
                instructions: p.clone(),
                proposer: w.a.addr.clone(),
                revision: u32::MAX,
            },
        );
        let mut ap = soroban_sdk::Vec::new(&w.env);
        for q in parts.iter() {
            ap.push_back(Approval {
                participant: q,
                digest: dmax.clone(),
            });
        }
        st.set(&key(&w, "Approvals", &s), &ap);
    });
    let _ = d;
    let other = plan(&w, &[(&w.a, &w.d, 10), (&w.b, &w.c, 10)]);
    assert_eq!(
        propose(&w, &s, &w.c, &other),
        Out::Contract(Error::Overflow)
    );
    assert_eq!(
        propose(&w, &s, &w.c, &p),
        Out::Contract(Error::Overflow),
        "not even identical instructions can wrap the revision"
    );
    let cur = clearing(&w).get_proposal(&s);
    assert_eq!((cur.revision, cur.digest), (u32::MAX, dmax));
    assert_eq!(clearing(&w).get_approvals(&s).len(), 4);
    assert_eq!(state_of(&w, &s), State::Approved);
    // the maxed proposal can still be settled: the failure only blocks further replacement
    must(settle(&w, &s, &clearing(&w).get_proposal(&s).digest, &p));
}
