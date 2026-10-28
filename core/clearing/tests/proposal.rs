//! Settlement proposals (validation of any plan, multiple valid plans, replacement) and approvals.
#![cfg(test)]
mod support;
use support::*;
use tobin_clearing_v1::{Error, State};

fn no_proposal(w: &World, s: &soroban_sdk::BytesN<32>) {
    assert_eq!(clearing(w).try_get_proposal(s).unwrap_err().unwrap(), Error::NoProposal);
}

#[test]
fn the_readme_example_has_the_expected_nets_and_one_valid_plan() {
    // A owes B 100, B owes C 80, C owes A 70. Outgoing minus incoming: A +30 (debtor), B -20, C -10 (creditors).
    let w = world();
    let s = readme_session(&w, 1, &w.c);
    let good = readme_plan(&w);
    let d = propose_digest(&w, &s, &w.b, &good);
    let p = clearing(&w).get_proposal(&s);
    assert_eq!((p.digest.clone(), p.revision, p.proposer.clone()), (d, 1, w.b.addr.clone()));
    assert_eq!(p.instructions, good);
    assert_eq!(state_of(&w, &s), State::Committed);
    assert_eq!(clearing(&w).get_approvals(&s).len(), 0);
    // payers and payees swapped (the old "positive = receives" reading) is not valid
    let s2 = readme_session(&w, 2, &w.c);
    let swapped = plan(&w, &[(&w.b, &w.a, 20), (&w.c, &w.a, 10)]);
    assert_eq!(propose(&w, &s2, &w.a, &swapped), Out::Contract(Error::FlowMismatch));
}

#[test]
fn invalid_plans_are_rejected_with_specific_errors_and_change_nothing() {
    let w = world();
    let s = readme_session(&w, 1, &w.c);
    let cases: std::vec::Vec<(&str, soroban_sdk::Vec<tobin_clearing_v1::Instruction>, Error)> = std::vec![
        ("omitted instruction", plan(&w, &[(&w.a, &w.b, 20)]), Error::FlowMismatch),
        ("amount too high", plan(&w, &[(&w.a, &w.b, 21), (&w.a, &w.c, 10)]), Error::FlowMismatch),
        ("amount too low", plan(&w, &[(&w.a, &w.b, 20), (&w.a, &w.c, 9)]), Error::FlowMismatch),
        ("payers and payees swapped", plan(&w, &[(&w.b, &w.a, 20), (&w.c, &w.a, 10)]), Error::FlowMismatch),
        ("empty while a net is non-zero", raw_plan(&w, &[]), Error::FlowMismatch),
        ("a creditor also pays (offsetting)", plan(&w, &[(&w.a, &w.b, 30), (&w.b, &w.c, 10)]), Error::OffsettingFlows),
        ("duplicate ordered pair", raw_plan(&w, &[(&w.a, &w.b, 10), (&w.a, &w.b, 10), (&w.a, &w.c, 10)]), Error::InstructionOrder),
        ("not in the required order", raw_plan(&w, &[(&w.a, &w.c, 10), (&w.a, &w.b, 20)]), Error::InstructionOrder),
        ("payer equals payee", raw_plan(&w, &[(&w.a, &w.a, 5)]), Error::InstructionSelfPay),
        ("zero amount", raw_plan(&w, &[(&w.a, &w.b, 0)]), Error::BadAmount),
        ("negative amount", raw_plan(&w, &[(&w.a, &w.b, -5), (&w.a, &w.c, 10)]), Error::BadAmount),
        ("a party that is not admitted", raw_plan(&w, &[(&w.a, &w.x, 1)]), Error::UnknownParty),
        ("more instructions than the ceiling", raw_plan(&w, &std::vec![(&w.a, &w.b, 1); 17]), Error::TooManyInstructions),
    ];
    for (name, list, want) in cases {
        assert_eq!(propose(&w, &s, &w.a, &list), Out::Contract(want), "{name}");
        no_proposal(&w, &s);
        assert_eq!(state_of(&w, &s), State::Committed, "{name}");
    }
}

#[test]
fn a_participant_with_a_zero_net_cannot_be_given_value() {
    let w = world();
    let s = sid(&w, 1);
    must(create(&w, &w.a, &s, 4, 16));
    for p in [&w.b, &w.c, &w.d] {
        must(join(&w, &s, p, &w.a));
    }
    must(submit(&w, &s, &ob(&w, 1, &w.a, &w.b, 10))); // C and D have net zero
    must(finalize(&w, &s, &w.c));
    assert_eq!(propose(&w, &s, &w.a, &plan(&w, &[(&w.a, &w.b, 5), (&w.a, &w.c, 5)])), Out::Contract(Error::FlowMismatch));
    assert_eq!(propose(&w, &s, &w.a, &plan(&w, &[(&w.a, &w.b, 10), (&w.c, &w.d, 3)])), Out::Contract(Error::FlowMismatch));
    no_proposal(&w, &s);
    must(propose(&w, &s, &w.a, &plan(&w, &[(&w.a, &w.b, 10)])));
}

#[test]
fn any_valid_plan_is_accepted_not_only_one_canonical_output() {
    // Nets A +10, B +10, C -10, D -10: several different correct plans exist, each with its own digest.
    let w = world();
    let s = four_session(&w, 1);
    let p1 = plan(&w, &[(&w.a, &w.c, 10), (&w.b, &w.d, 10)]);
    let p2 = plan(&w, &[(&w.a, &w.d, 10), (&w.b, &w.c, 10)]);
    let p3 = plan(&w, &[(&w.a, &w.c, 5), (&w.a, &w.d, 5), (&w.b, &w.c, 5), (&w.b, &w.d, 5)]);
    let d1 = propose_digest(&w, &s, &w.d, &p1);
    let d2 = propose_digest(&w, &s, &w.a, &p2);
    let d3 = propose_digest(&w, &s, &w.c, &p3);
    assert!(d1 != d2 && d2 != d3 && d1 != d3);
    let cur = clearing(&w).get_proposal(&s);
    assert_eq!((cur.digest, cur.revision, cur.instructions), (d3, 3, p3));
}

#[test]
fn proposing_requires_an_admitted_authorizing_participant_in_the_right_state() {
    let w = world();
    let s = readme_session(&w, 1, &w.c);
    let good = readme_plan(&w);
    assert_eq!(propose(&w, &s, &w.x, &good), Out::Contract(Error::NotParticipant));
    assert!(propose_as(&w, &s, &w.b.addr, &good, &[&w.a.addr]).is_host_auth()); // somebody else authorizes
    assert!(propose_as(&w, &s, &w.b.addr, &good, &[]).is_host_auth());
    no_proposal(&w, &s);
    // OPEN session: not yet finalized
    let o = sid(&w, 2);
    must(create(&w, &w.a, &o, 3, 5));
    must(join(&w, &o, &w.b, &w.a));
    must(submit(&w, &o, &ob(&w, 1, &w.a, &w.b, 4)));
    assert_eq!(propose(&w, &o, &w.a, &plan(&w, &[(&w.a, &w.b, 4)])), Out::Contract(Error::WrongState));
    assert_eq!(propose(&w, &sid(&w, 99), &w.a, &good), Out::Contract(Error::SessionNotFound));
    // any admitted participant, whatever its role: the creator, a creditor, the finalizer
    for (n, who) in [(3u8, &w.a), (4, &w.b), (5, &w.c)] {
        let s = readme_session(&w, n, &w.c);
        must(propose(&w, &s, who, &good));
    }
}

#[test]
fn a_replacement_invalidates_every_earlier_approval() {
    let w = world();
    let s = four_session(&w, 1);
    let p1 = plan(&w, &[(&w.a, &w.c, 10), (&w.b, &w.d, 10)]);
    let p2 = plan(&w, &[(&w.a, &w.d, 10), (&w.b, &w.c, 10)]);
    let d1 = propose_digest(&w, &s, &w.a, &p1);
    assert!(!approve_bool(&w, &s, &w.a, &d1));
    assert!(!approve_bool(&w, &s, &w.b, &d1));
    assert_eq!(clearing(&w).get_approvals(&s).len(), 2);
    let d2 = propose_digest(&w, &s, &w.c, &p2);
    assert!(d1 != d2);
    assert_eq!(clearing(&w).get_approvals(&s).len(), 0, "all earlier approvals are gone");
    assert_eq!(clearing(&w).get_proposal(&s).revision, 2);
    assert_eq!(state_of(&w, &s), State::Committed);
    // an approval of the old digest never counts
    assert_eq!(approve(&w, &s, &w.c, &d1), Out::Contract(Error::DigestMismatch));
    assert_eq!(approve(&w, &s, &w.a, &d1), Out::Contract(Error::DigestMismatch));
    // the participants who approved before must approve again
    assert!(clearing(&w).get_approval(&s, &w.a.addr).is_none());
    for p in [&w.a, &w.b, &w.c] {
        assert!(!approve_bool(&w, &s, p, &d2));
    }
    assert_eq!(state_of(&w, &s), State::Committed);
    assert!(approve_bool(&w, &s, &w.d, &d2));
    assert_eq!(state_of(&w, &s), State::Approved);
}

#[test]
fn a_replacement_from_approved_returns_the_session_to_committed() {
    let w = world();
    let s = four_session(&w, 1);
    let p1 = plan(&w, &[(&w.a, &w.c, 10), (&w.b, &w.d, 10)]);
    let p2 = plan(&w, &[(&w.a, &w.d, 10), (&w.b, &w.c, 10)]);
    let d1 = propose_digest(&w, &s, &w.a, &p1);
    approve_all(&w, &s, &d1);
    assert_eq!(state_of(&w, &s), State::Approved);
    assert_eq!(clearing(&w).get_approvals(&s).len(), 4);
    let d2 = propose_digest(&w, &s, &w.b, &p2);
    assert_eq!(state_of(&w, &s), State::Committed);
    assert_eq!(clearing(&w).get_approvals(&s).len(), 0);
    // settlement is impossible until every participant approves the NEW digest
    assert_eq!(settle(&w, &s, &d2, &p2), Out::Contract(Error::MissingApproval));
    assert_eq!(settle(&w, &s, &d1, &p1), Out::Contract(Error::MissingApproval));
}

#[test]
fn a_replacement_never_touches_the_frozen_data() {
    let w = world();
    let s = four_session(&w, 1);
    let p1 = plan(&w, &[(&w.a, &w.c, 10), (&w.b, &w.d, 10)]);
    let p2 = plan(&w, &[(&w.a, &w.d, 10), (&w.b, &w.c, 10)]);
    must(propose(&w, &s, &w.a, &p1));
    let (sess, obs, cbytes) = (clearing(&w).get_session(&s), clearing(&w).get_obligations(&s), clearing(&w).commitment_bytes(&s));
    let pbytes1 = clearing(&w).proposal_bytes(&s);
    must(propose(&w, &s, &w.a, &p2));
    let after = clearing(&w).get_session(&s);
    assert_eq!(after.obligation_commitment, sess.obligation_commitment);
    assert_eq!((after.participants, after.token, after.creator, after.max_participants, after.max_obligations), (sess.participants, sess.token, sess.creator, sess.max_participants, sess.max_obligations));
    assert_eq!(clearing(&w).get_obligations(&s), obs);
    assert_eq!(clearing(&w).commitment_bytes(&s), cbytes);
    assert!(clearing(&w).proposal_bytes(&s) != pbytes1);
}

#[test]
fn an_identical_proposal_is_accepted_as_a_new_revision_and_clears_the_approvals() {
    let w = world();
    let s = four_session(&w, 1);
    let p1 = plan(&w, &[(&w.a, &w.c, 10), (&w.b, &w.d, 10)]);
    let d1 = propose_digest(&w, &s, &w.a, &p1);
    assert!(!approve_bool(&w, &s, &w.a, &d1));
    let d2 = propose_digest(&w, &s, &w.b, &p1);
    assert!(d1 != d2, "same instructions, other revision, other digest");
    let p = clearing(&w).get_proposal(&s);
    assert_eq!((p.revision, p.proposer), (2, w.b.addr.clone()));
    assert_eq!(p.instructions, p1);
    assert_eq!(clearing(&w).get_approvals(&s).len(), 0, "the replacement cleared the approval of revision 1");
    assert_eq!(approve(&w, &s, &w.a, &d1), Out::Contract(Error::DigestMismatch));
}

#[test]
fn a_replacement_that_fails_validation_changes_nothing() {
    let w = world();
    let s = four_session(&w, 1);
    let p1 = plan(&w, &[(&w.a, &w.c, 10), (&w.b, &w.d, 10)]);
    let d1 = propose_digest(&w, &s, &w.a, &p1);
    approve_all(&w, &s, &d1);
    assert_eq!(state_of(&w, &s), State::Approved);
    let bad = plan(&w, &[(&w.a, &w.c, 10), (&w.b, &w.d, 9)]);
    assert_eq!(propose(&w, &s, &w.a, &bad), Out::Contract(Error::FlowMismatch));
    assert!(propose_as(&w, &s, &w.a.addr, &plan(&w, &[(&w.a, &w.d, 10), (&w.b, &w.c, 10)]), &[&w.b.addr]).is_host_auth());
    // old proposal, its revision, all four approvals and the APPROVED state are exactly as before
    assert_eq!(clearing(&w).get_proposal(&s).digest, d1);
    assert_eq!(clearing(&w).get_proposal(&s).revision, 1);
    assert_eq!(clearing(&w).get_approvals(&s).len(), 4);
    assert_eq!(state_of(&w, &s), State::Approved);
}

#[test]
fn every_admitted_participant_must_approve_the_current_digest() {
    let w = world();
    let s = readme_session(&w, 1, &w.c);
    let good = readme_plan(&w);
    let d = propose_digest(&w, &s, &w.a, &good);
    // no approval yet / some approvals: settlement is refused
    assert_eq!(settle(&w, &s, &d, &good), Out::Contract(Error::MissingApproval));
    assert!(!approve_bool(&w, &s, &w.a, &d));
    assert!(!approve_bool(&w, &s, &w.b, &d));
    assert_eq!(state_of(&w, &s), State::Committed);
    assert_eq!(settle(&w, &s, &d, &good), Out::Contract(Error::MissingApproval));
    // an exact duplicate is idempotent
    assert!(!approve_bool(&w, &s, &w.b, &d));
    assert_eq!(clearing(&w).get_approvals(&s).len(), 2);
    // the third completes the set in the same transaction
    assert!(approve_bool(&w, &s, &w.c, &d));
    assert_eq!(state_of(&w, &s), State::Approved);
}

#[test]
fn approval_rules() {
    let w = world();
    let s = readme_session(&w, 1, &w.c);
    let good = readme_plan(&w);
    let anything = oid(&w, 5);
    assert_eq!(approve(&w, &s, &w.a, &anything), Out::Contract(Error::NoProposal)); // nothing to approve yet
    let d = propose_digest(&w, &s, &w.a, &good);
    assert_eq!(approve(&w, &s, &w.x, &d), Out::Contract(Error::NotParticipant));
    assert_eq!(approve(&w, &s, &w.a, &anything), Out::Contract(Error::DigestMismatch));
    assert!(approve_as(&w, &s, &w.a.addr, &d, &[&w.b.addr]).is_host_auth()); // only the participant itself can approve for itself
    assert!(approve_as(&w, &s, &w.a.addr, &d, &[]).is_host_auth());
    assert_eq!(clearing(&w).get_approvals(&s).len(), 0);
    // a flipped byte of the true digest
    let mut raw = d.to_array();
    raw[0] ^= 1;
    assert_eq!(approve(&w, &s, &w.a, &soroban_sdk::BytesN::from_array(&w.env, &raw)), Out::Contract(Error::DigestMismatch));
    // OPEN session: no proposal can exist
    let o = sid(&w, 2);
    must(create(&w, &w.a, &o, 3, 5));
    assert_eq!(approve(&w, &o, &w.a, &d), Out::Contract(Error::WrongState));
    // after the set completes, a further approval is refused
    approve_all(&w, &s, &d);
    assert_eq!(approve(&w, &s, &w.a, &d), Out::Contract(Error::WrongState));
}

#[test]
fn an_approval_is_not_a_debit_authorization() {
    // all three approved; no debtor authorizes the transfers: the settlement fails and nothing moves
    let w = world();
    let s = readme_session(&w, 1, &w.c);
    let good = readme_plan(&w);
    mint(&w, &w.a, 100);
    let d = propose_digest(&w, &s, &w.a, &good);
    approve_all(&w, &s, &d);
    assert!(settle_with(&w, &s, &d, &[]).is_host_auth());
    assert_eq!((bal(&w, &w.a), bal(&w, &w.b), bal(&w, &w.c)), (100, 0, 0));
    assert_eq!(state_of(&w, &s), State::Approved);
}

// ---- EQ-05: revision-bound approvals (stale signed approval replay) ----

#[test]
fn a_stale_approval_signed_for_revision_1_cannot_count_at_revision_3_after_a_b_a() {
    let w = world();
    let s = four_session(&w, 1);
    let pa = plan(&w, &[(&w.a, &w.c, 10), (&w.b, &w.d, 10)]);
    let pb = plan(&w, &[(&w.a, &w.d, 10), (&w.b, &w.c, 10)]);
    // revision 1 = A. The authorization a participant would sign is approve(session, Alice, digest-of-revision-1); keep it, do not submit it.
    let d1 = propose_digest(&w, &s, &w.a, &pa);
    assert_eq!(clearing(&w).get_proposal(&s).revision, 1);
    // revision 2 = B, revision 3 = A again (identical instructions)
    let d2 = propose_digest(&w, &s, &w.b, &pb);
    let d3 = propose_digest(&w, &s, &w.c, &pa);
    assert_eq!(clearing(&w).get_proposal(&s).revision, 3, "re-proposing identical instructions still advances the revision");
    assert!(d1 != d2 && d2 != d3);
    assert!(d3 != d1, "the revision is bound into the digest: identical instructions at another revision have another digest");
    // the stale approval (for the revision-1 digest) must neither be accepted nor counted
    assert_eq!(approve(&w, &s, &w.a, &d1), Out::Contract(Error::DigestMismatch));
    assert_eq!(clearing(&w).get_approvals(&s).len(), 0);
    assert_eq!(state_of(&w, &s), State::Committed);
    // a freshly signed approval for revision 3 is accepted
    assert!(!approve_bool(&w, &s, &w.a, &d3));
    assert_eq!(clearing(&w).get_approvals(&s).len(), 1);
}

#[test]
fn an_approval_for_one_revision_cannot_satisfy_another_and_settlement_needs_current_revision_approvals() {
    let w = world();
    let s = four_session(&w, 1);
    let pa = plan(&w, &[(&w.a, &w.c, 10), (&w.b, &w.d, 10)]);
    let d1 = propose_digest(&w, &s, &w.a, &pa);
    approve_all(&w, &s, &d1);
    assert_eq!(state_of(&w, &s), State::Approved);
    // an identical re-proposal (revision 2) takes the session back to COMMITTED with no approval
    let d2 = propose_digest(&w, &s, &w.b, &pa);
    assert_eq!(state_of(&w, &s), State::Committed);
    assert_eq!(clearing(&w).get_approvals(&s).len(), 0);
    assert_eq!(settle(&w, &s, &d2, &pa), Out::Contract(Error::MissingApproval));
    assert_eq!(settle(&w, &s, &d1, &pa), Out::Contract(Error::MissingApproval));
    // three of four at revision 2 is still incomplete
    for who in [&w.a, &w.b, &w.c] {
        assert_eq!(approve(&w, &s, who, &d1), Out::Contract(Error::DigestMismatch), "revision-1 digest refused");
        assert!(!approve_bool(&w, &s, who, &d2));
    }
    assert_eq!(settle(&w, &s, &d2, &pa), Out::Contract(Error::MissingApproval));
    assert!(approve_bool(&w, &s, &w.d, &d2));
    assert_eq!(state_of(&w, &s), State::Approved);
}

#[test]
fn a_failed_replacement_leaves_the_proposal_revision_and_approvals_unchanged() {
    let w = world();
    let s = four_session(&w, 1);
    let pa = plan(&w, &[(&w.a, &w.c, 10), (&w.b, &w.d, 10)]);
    let d1 = propose_digest(&w, &s, &w.a, &pa);
    assert!(!approve_bool(&w, &s, &w.a, &d1));
    let bad = plan(&w, &[(&w.a, &w.c, 9), (&w.b, &w.d, 10)]);
    assert_eq!(propose(&w, &s, &w.b, &bad), Out::Contract(Error::FlowMismatch));
    assert_eq!(propose(&w, &s, &w.x, &pa), Out::Contract(Error::NotParticipant));
    let p = clearing(&w).get_proposal(&s);
    assert_eq!((p.revision, p.digest), (1, d1));
    assert_eq!(clearing(&w).get_approvals(&s).len(), 1);
}
