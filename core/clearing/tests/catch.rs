//! EQ-16 at host level: what happens to earlier transfers when a contract CATCHES a failed token transfer?
//! The test-only contract `Catcher` below is not part of TobinClearingV1. It performs one successful transfer, then a second transfer that
//! fails, in three variants:
//!   * `ignore`  : swallows the failed transfer and carries on (the Phase A mutant M3), returning Ok;
//!   * `catch`   : catches the failure and RETURNS its own contract error;
//!   * `propagate`: lets the failure propagate (what TobinClearingV1.settle does).
//! Each writes a marker before the transfers. Only a host test of the Soroban test environment; no network.
#![cfg(test)]
mod support;
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype,
    testutils::{MockAuth, MockAuthInvoke},
    Address, Env, IntoVal,
};
use support::*;
use tobin_clearing_v1::TokenClient;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum CatchError {
    TransferFailed = 7,
}

#[contracttype]
enum K {
    Marker,
}

#[contract]
pub struct Catcher;

#[contractimpl]
impl Catcher {
    pub fn ignore(
        env: Env,
        token: Address,
        a: Address,
        b: Address,
        c: Address,
        first: i128,
        second: i128,
    ) -> Result<(), CatchError> {
        env.storage().persistent().set(&K::Marker, &true);
        let t = TokenClient::new(&env, &token);
        t.transfer(&a, &c, &first);
        let _ = t.try_transfer(&b, &c, &second); // swallowed
        Ok(())
    }

    pub fn catch(
        env: Env,
        token: Address,
        a: Address,
        b: Address,
        c: Address,
        first: i128,
        second: i128,
    ) -> Result<(), CatchError> {
        env.storage().persistent().set(&K::Marker, &true);
        let t = TokenClient::new(&env, &token);
        t.transfer(&a, &c, &first);
        match t.try_transfer(&b, &c, &second) {
            Ok(Ok(())) => Ok(()),
            _ => Err(CatchError::TransferFailed), // caught, and returned as the contract's own error
        }
    }

    pub fn propagate(
        env: Env,
        token: Address,
        a: Address,
        b: Address,
        c: Address,
        first: i128,
        second: i128,
    ) -> Result<(), CatchError> {
        env.storage().persistent().set(&K::Marker, &true);
        let t = TokenClient::new(&env, &token);
        t.transfer(&a, &c, &first);
        t.transfer(&b, &c, &second);
        Ok(())
    }

    pub fn marker(env: Env) -> bool {
        env.storage().persistent().has(&K::Marker)
    }
}

#[derive(Debug, PartialEq)]
enum R {
    Ok,
    OwnError(CatchError),
    Host,
}

/// Run `f` ("ignore" | "catch" | "propagate") with A and B each authorizing their own transfer (`b_signs` false: B does not authorize).
fn run(w: &World, catcher: &Address, f: &str, first: i128, second: i128, b_signs: bool) -> R {
    let ta = MockAuthInvoke {
        contract: &w.token,
        fn_name: "transfer",
        args: (&w.a.addr, &w.c.addr, &first).into_val(&w.env),
        sub_invokes: &[],
    };
    let tb = MockAuthInvoke {
        contract: &w.token,
        fn_name: "transfer",
        args: (&w.b.addr, &w.c.addr, &second).into_val(&w.env),
        sub_invokes: &[],
    };
    // The Catcher never calls require_auth itself, so each account's authorization is rooted at its own token transfer.
    let mut auths = std::vec![MockAuth {
        address: &w.a.addr,
        invoke: &ta
    }];
    if b_signs {
        auths.push(MockAuth {
            address: &w.b.addr,
            invoke: &tb,
        });
    }
    let client = CatcherClient::new(&w.env, catcher);
    let c = client.mock_auths(&auths);
    let (t, a, b, cc) = (&w.token, &w.a.addr, &w.b.addr, &w.c.addr);
    match f {
        "ignore" => own(c.try_ignore(t, a, b, cc, &first, &second)),
        "catch" => own(c.try_catch(t, a, b, cc, &first, &second)),
        _ => own(c.try_propagate(t, a, b, cc, &first, &second)),
    }
}

fn own<T: std::fmt::Debug, C: std::fmt::Debug, I: std::fmt::Debug>(
    r: Result<Result<T, C>, Result<CatchError, I>>,
) -> R {
    match r {
        Ok(Ok(_)) => R::Ok,
        Ok(Err(e)) => panic!("conversion error {e:?}"),
        Err(Ok(e)) => R::OwnError(e),
        Err(Err(_)) => R::Host,
    }
}

fn setup(a_funds: i128, b_funds: i128) -> (World, Address) {
    let w = world();
    let catcher = w.env.register(Catcher, ());
    mint(&w, &w.a, a_funds);
    mint(&w, &w.b, b_funds);
    (w, catcher)
}

fn state(w: &World, catcher: &Address) -> (i128, i128, i128, bool) {
    (
        bal(w, &w.a),
        bal(w, &w.b),
        bal(w, &w.c),
        CatcherClient::new(&w.env, catcher).marker(),
    )
}

#[test]
fn a_contract_that_ignores_a_failed_transfer_keeps_the_earlier_transfer_and_its_marker() {
    // the Phase A mutant M3: the first transfer and the marker persist although the second transfer failed
    let (w, c) = setup(10, 1);
    assert_eq!(run(&w, &c, "ignore", 10, 5, true), R::Ok);
    assert_eq!(state(&w, &c), (0, 1, 10, true));
}

#[test]
fn a_contract_that_catches_a_failed_transfer_and_returns_an_error_rolls_everything_back() {
    // EQ-16 at host level: the earlier transfer and the marker are reverted when the contract returns its own error
    let (w, c) = setup(10, 1);
    assert_eq!(
        run(&w, &c, "catch", 10, 5, true),
        R::OwnError(CatchError::TransferFailed)
    );
    assert_eq!(state(&w, &c), (10, 1, 0, false));
}

#[test]
fn a_contract_that_lets_the_failure_propagate_also_rolls_everything_back() {
    let (w, c) = setup(10, 1);
    assert_eq!(run(&w, &c, "propagate", 10, 5, true), R::Host);
    assert_eq!(state(&w, &c), (10, 1, 0, false));
}

#[test]
fn a_catch_also_swallows_a_missing_authorization_so_it_would_blur_two_different_failures() {
    // B has the funds but does not authorize its transfer. Observed at host level (soroban-env-host 29): the failed authorization inside
    // the caught call IS caught, so a contract that catches transfer errors cannot tell "missing debit authorization" from "transfer
    // failure". Together with the S12 requirement of distinct error conditions this is why TobinClearingV1.settle lets the failure
    // propagate (a missing authorization is then a host Auth error and a token failure the token's own contract error).
    let (w, c) = setup(10, 10);
    assert_eq!(
        run(&w, &c, "catch", 10, 5, false),
        R::OwnError(CatchError::TransferFailed)
    );
    assert_eq!(
        state(&w, &c),
        (10, 10, 0, false),
        "everything still rolled back"
    );
    assert_eq!(
        run(&w, &c, "propagate", 10, 5, false),
        R::Host,
        "propagating keeps it a host authorization error"
    );
    assert_eq!(state(&w, &c), (10, 10, 0, false));
    // and the ignoring variant leaves a PARTIAL settlement: A paid, B did not, and the marker says the work is done
    assert_eq!(run(&w, &c, "ignore", 10, 5, false), R::Ok);
    assert_eq!(state(&w, &c), (0, 10, 10, true));
}
