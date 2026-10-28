//! Sessions, membership, obligations and finalization (host tests; native contracts; explicit per-call authorizations).
#![cfg(test)]
mod support;
use soroban_sdk::{
    testutils::{MockAuth, MockAuthInvoke},
    IntoVal,
};
use support::*;
use tobin_clearing_v1::{Error, State};

#[test]
fn create_admits_the_creator_and_fixes_the_terms() {
    let w = world();
    let s = sid(&w, 1);
    must(create(&w, &w.a, &s, 3, 10));
    let v = clearing(&w).get_session(&s);
    assert_eq!(v.creator, w.a.addr);
    assert_eq!(v.token, w.token);
    assert_eq!((v.max_participants, v.max_obligations), (3, 10));
    assert_eq!(v.state, State::Open);
    assert_eq!(v.participants.len(), 1);
    assert_eq!(v.participants.get(0).unwrap(), w.a.addr);
    assert!(v.obligation_commitment.is_none());
    let cfg = clearing(&w).config();
    assert_eq!((cfg.participant_ceiling, cfg.obligation_ceiling, cfg.instruction_ceiling), (4, 16, 16));
}

#[test]
fn create_rejects_bad_inputs() {
    let w = world();
    let s = sid(&w, 1);
    must(create(&w, &w.a, &s, 4, 16));
    // the id is never reused
    assert_eq!(create(&w, &w.b, &s, 4, 16), Out::Contract(Error::SessionExists));
    // the token must be a contract address
    let classic = real_acct(&w.env, 77); // a classic (G...) account address
    assert_eq!(create_as(&w, &w.a, &sid(&w, 2), &classic.addr, 4, 16, &[&w.a.addr]), Out::Contract(Error::BadAddressKind));
    // capacities: at least 2 participants and 1 obligation, at most the ceilings
    for (mp, mo) in [(1, 5), (5, 5), (0, 5), (3, 0), (3, 17)] {
        assert_eq!(create(&w, &w.a, &sid(&w, 3), mp, mo), Out::Contract(Error::BadCapacity), "({mp},{mo})");
    }
    assert_eq!(clearing(&w).try_get_session(&sid(&w, 3)).unwrap_err().unwrap(), Error::SessionNotFound);
}

#[test]
fn create_needs_the_creators_own_authorization() {
    let w = world();
    let s = sid(&w, 1);
    assert!(create_as(&w, &w.a, &s, &w.token, 4, 16, &[&w.b.addr]).is_host_auth());
    assert!(create_as(&w, &w.a, &s, &w.token, 4, 16, &[]).is_host_auth());
    assert_eq!(clearing(&w).try_get_session(&s).unwrap_err().unwrap(), Error::SessionNotFound);
}

#[test]
fn each_session_keeps_its_own_token_and_capacities() {
    let w = world();
    let other = w.env.register(
        tobin_test_token::TobinTestToken,
        (w.minter.addr.clone(), 5i128, 7u32, soroban_sdk::String::from_str(&w.env, "Other"), soroban_sdk::String::from_str(&w.env, "OTH")),
    );
    must(create_as(&w, &w.a, &sid(&w, 1), &w.token, 4, 16, &[&w.a.addr]));
    must(create_as(&w, &w.b, &sid(&w, 2), &other, 2, 3, &[&w.b.addr]));
    let (s1, s2) = (clearing(&w).get_session(&sid(&w, 1)), clearing(&w).get_session(&sid(&w, 2)));
    assert_eq!((s1.token, s1.max_participants, s1.creator), (w.token.clone(), 4, w.a.addr.clone()));
    assert_eq!((s2.token, s2.max_participants, s2.creator), (other, 2, w.b.addr.clone()));
}

#[test]
fn joining_needs_the_joiners_and_the_creators_authorization() {
    let w = world();
    let s = sid(&w, 1);
    must(create(&w, &w.a, &s, 4, 16));
    // only the joiner / only the creator / bystanders / nobody: a host authorization error, nothing is written
    assert!(join_as(&w, &s, &w.b, &[&w.b.addr]).is_host_auth());
    assert!(join_as(&w, &s, &w.b, &[&w.a.addr]).is_host_auth());
    assert!(join_as(&w, &s, &w.b, &[&w.c.addr, &w.x.addr]).is_host_auth());
    assert!(join_as(&w, &s, &w.b, &[]).is_host_auth());
    assert_eq!(clearing(&w).get_session(&s).participants.len(), 1);
    // both: admitted
    must(join(&w, &s, &w.b, &w.a));
    assert_eq!(clearing(&w).get_session(&s).participants.len(), 2);
}

#[test]
fn an_authorization_for_one_joiner_or_session_does_not_carry_to_another() {
    let w = world();
    let s = sid(&w, 1);
    must(create(&w, &w.a, &s, 4, 16));
    must(create(&w, &w.a, &sid(&w, 2), 4, 16));
    // authorizations made for B joining session 1 (B and the creator), applied to C joining session 1
    let inv = MockAuthInvoke { contract: &w.clearing, fn_name: "join_session", args: (&s, &w.b.addr).into_val(&w.env), sub_invokes: &[] };
    let auths = [MockAuth { address: &w.b.addr, invoke: &inv }, MockAuth { address: &w.a.addr, invoke: &inv }];
    let r = clearing(&w).mock_auths(&auths).try_join_session(&s, &w.c.addr);
    assert!(classify(&w.env, r).is_host_auth());
    // ... or to B joining session 2
    let r = clearing(&w).mock_auths(&auths).try_join_session(&sid(&w, 2), &w.b.addr);
    assert!(classify(&w.env, r).is_host_auth());
    assert_eq!(clearing(&w).get_session(&s).participants.len(), 1);
    assert_eq!(clearing(&w).get_session(&sid(&w, 2)).participants.len(), 1);
    // the same authorizations do admit B to session 1
    let r = clearing(&w).mock_auths(&auths).try_join_session(&s, &w.b.addr);
    must(classify(&w.env, r));
}

#[test]
fn joining_rules() {
    let w = world();
    let s = sid(&w, 1);
    must(create(&w, &w.a, &s, 2, 16));
    assert_eq!(join(&w, &s, &w.a, &w.a), Out::Contract(Error::ParticipantExists)); // the creator is already admitted
    must(join(&w, &s, &w.b, &w.a));
    assert_eq!(join(&w, &s, &w.b, &w.a), Out::Contract(Error::ParticipantExists));
    assert_eq!(join(&w, &s, &w.c, &w.a), Out::Contract(Error::TooManyParticipants)); // capacity 2
    assert_eq!(join(&w, &sid(&w, 9), &w.c, &w.a), Out::Contract(Error::SessionNotFound));
    // not after finalization
    let s3 = sid(&w, 3);
    must(create(&w, &w.a, &s3, 4, 16));
    must(join(&w, &s3, &w.b, &w.a));
    must(submit(&w, &s3, &ob(&w, 1, &w.a, &w.b, 5)));
    must(finalize(&w, &s3, &w.a));
    assert_eq!(join(&w, &s3, &w.c, &w.a), Out::Contract(Error::WrongState));
}

#[test]
fn obligation_rules() {
    let w = world();
    let s = sid(&w, 1);
    must(create(&w, &w.a, &s, 3, 3));
    must(join(&w, &s, &w.b, &w.a));
    must(submit(&w, &s, &ob(&w, 5, &w.a, &w.b, 7)));
    assert_eq!(submit(&w, &s, &ob(&w, 5, &w.a, &w.b, 7)), Out::Contract(Error::DuplicateObligation));
    assert_eq!(submit(&w, &s, &ob(&w, 5, &w.b, &w.a, 9)), Out::Contract(Error::DuplicateObligation)); // same id, other content
    assert_eq!(submit(&w, &s, &ob(&w, 6, &w.a, &w.b, 0)), Out::Contract(Error::BadAmount));
    assert_eq!(submit(&w, &s, &ob(&w, 6, &w.a, &w.b, -1)), Out::Contract(Error::BadAmount));
    assert_eq!(submit(&w, &s, &ob(&w, 6, &w.a, &w.b, i128::MIN)), Out::Contract(Error::BadAmount));
    assert_eq!(submit(&w, &s, &ob(&w, 6, &w.a, &w.a, 1)), Out::Contract(Error::SameParty));
    assert_eq!(submit(&w, &s, &ob(&w, 6, &w.a, &w.c, 1)), Out::Contract(Error::UnknownParty)); // C never joined
    assert_eq!(submit(&w, &s, &ob(&w, 6, &w.x, &w.a, 1)), Out::Contract(Error::UnknownParty));
    must(submit(&w, &s, &ob(&w, 6, &w.b, &w.a, 2)));
    must(submit(&w, &s, &ob(&w, 7, &w.a, &w.b, 3)));
    assert_eq!(submit(&w, &s, &ob(&w, 8, &w.a, &w.b, 1)), Out::Contract(Error::TooManyObligations)); // capacity 3
    assert_eq!(clearing(&w).get_obligations(&s).len(), 3);
}

#[test]
fn only_the_debtor_can_authorize_an_obligation() {
    let w = world();
    let s = sid(&w, 1);
    must(create(&w, &w.a, &s, 3, 3));
    must(join(&w, &s, &w.b, &w.a));
    let o = ob(&w, 1, &w.a, &w.b, 10);
    assert!(submit_as(&w, &s, &o, &[&w.b.addr]).is_host_auth()); // the creditor
    assert!(submit_as(&w, &s, &o, &[&w.x.addr]).is_host_auth());
    assert!(submit_as(&w, &s, &o, &[]).is_host_auth());
    assert_eq!(clearing(&w).get_obligations(&s).len(), 0);
    // the debtor signs an obligation of 10 but the call carries 11: the host rejects
    let signed_for = ob(&w, 1, &w.a, &w.b, 10);
    let carried = ob(&w, 1, &w.a, &w.b, 11);
    let inv = MockAuthInvoke { contract: &w.clearing, fn_name: "submit_obligation", args: (&s, &signed_for).into_val(&w.env), sub_invokes: &[] };
    let auths = [MockAuth { address: &w.a.addr, invoke: &inv }];
    let r = clearing(&w).mock_auths(&auths).try_submit_obligation(&s, &carried);
    assert!(classify(&w.env, r).is_host_auth());
    assert_eq!(clearing(&w).get_obligations(&s).len(), 0);
    // the creditor does not authorize and no acceptance step exists: the debtor alone suffices
    must(submit(&w, &s, &o));
    assert_eq!(clearing(&w).get_obligations(&s).len(), 1);
}

#[test]
fn obligations_are_kept_in_id_order_whatever_the_submission_order() {
    let w = world();
    let s = sid(&w, 1);
    must(create(&w, &w.a, &s, 3, 5));
    must(join(&w, &s, &w.b, &w.a));
    for id in [9u8, 2, 7, 4] {
        must(submit(&w, &s, &ob(&w, id, &w.a, &w.b, id as i128)));
    }
    let ids: std::vec::Vec<u8> = clearing(&w).get_obligations(&s).iter().map(|o| o.id.to_array()[0]).collect();
    assert_eq!(ids, std::vec![2, 4, 7, 9]);
    assert_eq!(clearing(&w).get_obligation(&s, &oid(&w, 7)).amount, 7);
    assert_eq!(clearing(&w).try_get_obligation(&s, &oid(&w, 8)).unwrap_err().unwrap(), Error::ObligationNotFound);
}

#[test]
fn an_obligation_that_would_overflow_a_sum_is_rejected_at_submission() {
    let w = world();
    let s = sid(&w, 1);
    must(create(&w, &w.a, &s, 3, 5));
    must(join(&w, &s, &w.b, &w.a));
    must(join(&w, &s, &w.c, &w.a));
    must(submit(&w, &s, &ob(&w, 1, &w.a, &w.b, i128::MAX)));
    assert_eq!(submit(&w, &s, &ob(&w, 2, &w.a, &w.c, 1)), Out::Contract(Error::Overflow)); // A's outgoing sum
    assert_eq!(submit(&w, &s, &ob(&w, 3, &w.c, &w.b, 1)), Out::Contract(Error::Overflow)); // B's incoming sum
    assert_eq!(clearing(&w).get_obligations(&s).len(), 1);
    must(finalize(&w, &s, &w.c)); // a frozen set is always netable
}

#[test]
fn any_admitted_participant_may_finalize() {
    for who in 0..3 {
        let w = world();
        let s = sid(&w, 1);
        must(create(&w, &w.a, &s, 3, 5));
        must(join(&w, &s, &w.b, &w.a));
        must(join(&w, &s, &w.c, &w.a));
        must(submit(&w, &s, &ob(&w, 1, &w.a, &w.b, 5)));
        let f = [&w.a, &w.b, &w.c][who]; // the creator, a creditor, and a participant with no obligation
        must(finalize(&w, &s, f));
        assert_eq!(state_of(&w, &s), State::Committed);
        assert!(clearing(&w).get_session(&s).obligation_commitment.is_some());
    }
}

#[test]
fn finalization_rules_and_the_freeze() {
    let w = world();
    let s = sid(&w, 1);
    must(create(&w, &w.a, &s, 3, 5));
    assert_eq!(finalize(&w, &s, &w.a), Out::Contract(Error::TooFewParticipants));
    must(join(&w, &s, &w.b, &w.a));
    assert_eq!(finalize(&w, &s, &w.a), Out::Contract(Error::NoObligations));
    must(submit(&w, &s, &ob(&w, 1, &w.a, &w.b, 5)));
    assert_eq!(finalize(&w, &s, &w.x), Out::Contract(Error::NotParticipant));
    assert!(finalize_as(&w, &s, &w.b.addr, &[&w.a.addr]).is_host_auth()); // the caller must authorize itself
    assert_eq!(state_of(&w, &s), State::Open);
    let before = clearing(&w).get_session(&s);
    let obs_before = clearing(&w).get_obligations(&s);
    must(finalize(&w, &s, &w.b));
    assert_eq!(finalize(&w, &s, &w.a), Out::Contract(Error::WrongState));
    // frozen: participants, token, capacities and obligations are exactly as before; nothing can join or submit
    let after = clearing(&w).get_session(&s);
    assert_eq!(after.participants, before.participants);
    assert_eq!((after.token, after.max_participants, after.max_obligations, after.creator), (before.token, before.max_participants, before.max_obligations, before.creator));
    assert_eq!(clearing(&w).get_obligations(&s), obs_before);
    assert_eq!(join(&w, &s, &w.c, &w.a), Out::Contract(Error::WrongState));
    assert_eq!(submit(&w, &s, &ob(&w, 2, &w.a, &w.b, 1)), Out::Contract(Error::WrongState));
    // finalization is not settlement: it proposes nothing, approves nothing, moves nothing
    assert_eq!(clearing(&w).try_get_proposal(&s).unwrap_err().unwrap(), Error::NoProposal);
    assert_eq!(clearing(&w).get_approvals(&s).len(), 0);
    assert_eq!(state_of(&w, &s), State::Committed);
    let none = raw_plan(&w, &[]);
    assert_eq!(settle(&w, &s, &oid(&w, 0), &none), Out::Contract(Error::NoProposal));
}

#[test]
fn finalization_of_an_all_zero_net_set_is_allowed() {
    let w = world();
    let s = sid(&w, 1);
    must(create(&w, &w.a, &s, 3, 5));
    must(join(&w, &s, &w.b, &w.a));
    must(submit(&w, &s, &ob(&w, 1, &w.a, &w.b, 5)));
    must(submit(&w, &s, &ob(&w, 2, &w.b, &w.a, 5)));
    must(finalize(&w, &s, &w.a));
    assert_eq!(state_of(&w, &s), State::Committed);
}
