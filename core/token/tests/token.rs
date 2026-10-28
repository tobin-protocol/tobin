//! TobinTestToken: capped supply, explicit mint authority, checked arithmetic, authorization of transfers. Host tests (Soroban test host,
//! native contract). Test instrument only; nothing here says anything about a production token.
#![cfg(test)]

use soroban_sdk::{
    testutils::{Address as _, EnvTestConfig, MockAuth, MockAuthInvoke},
    Address, Env, IntoVal, String as SStr,
};
use tobin_test_token::{Error, TobinTestToken, TobinTestTokenClient};

struct T {
    env: Env,
    id: Address,
    minter: Address,
    a: Address,
    b: Address,
    other: Address,
}

fn deploy(cap: i128) -> T {
    let env = Env::new_with_config(EnvTestConfig { capture_snapshot_at_drop: false });
    let minter = Address::generate(&env);
    let id = env.register(TobinTestToken, (minter.clone(), cap, 7u32, SStr::from_str(&env, "Tobin Test Token"), SStr::from_str(&env, "TTT")));
    T { a: Address::generate(&env), b: Address::generate(&env), other: Address::generate(&env), env, id, minter }
}

fn client(t: &T) -> TobinTestTokenClient<'_> {
    TobinTestTokenClient::new(&t.env, &t.id)
}

fn mint_as(t: &T, signer: &Address, to: &Address, amount: i128, signed_amount: i128) -> Result<(), Result<Error, ()>> {
    let inv = MockAuthInvoke { contract: &t.id, fn_name: "mint", args: (to, &signed_amount).into_val(&t.env), sub_invokes: &[] };
    let auths = [MockAuth { address: signer, invoke: &inv }];
    match client(t).mock_auths(&auths).try_mint(to, &amount) {
        Ok(Ok(())) => Ok(()),
        Ok(Err(_)) => Err(Err(())),
        Err(Ok(e)) => Err(Ok(e)),
        Err(Err(_)) => Err(Err(())),
    }
}

fn mint(t: &T, to: &Address, amount: i128) -> Result<(), Result<Error, ()>> {
    mint_as(t, &t.minter, to, amount, amount)
}

fn transfer_as(t: &T, signer: &Address, from: &Address, to: &Address, amount: i128, signed_amount: i128) -> Result<(), Result<Error, ()>> {
    let inv = MockAuthInvoke { contract: &t.id, fn_name: "transfer", args: (from, to, &signed_amount).into_val(&t.env), sub_invokes: &[] };
    let auths = [MockAuth { address: signer, invoke: &inv }];
    match client(t).mock_auths(&auths).try_transfer(from, to, &amount) {
        Ok(Ok(())) => Ok(()),
        Ok(Err(_)) => Err(Err(())),
        Err(Ok(e)) => Err(Ok(e)),
        Err(Err(_)) => Err(Err(())),
    }
}

fn transfer(t: &T, from: &Address, to: &Address, amount: i128) -> Result<(), Result<Error, ()>> {
    transfer_as(t, from, from, to, amount, amount)
}

#[test]
fn the_constructor_fixes_the_minter_the_cap_and_the_metadata() {
    let t = deploy(1_000);
    let c = client(&t);
    assert_eq!((c.cap(), c.total_supply(), c.decimals()), (1_000, 0, 7));
    assert_eq!(c.minter(), t.minter);
    assert_eq!(c.name(), SStr::from_str(&t.env, "Tobin Test Token"));
    assert_eq!(c.symbol(), SStr::from_str(&t.env, "TTT"));
}

#[test]
#[should_panic]
fn a_non_positive_cap_cannot_be_constructed() {
    let _ = deploy(0);
}

#[test]
fn supply_can_reach_the_cap_and_never_exceed_it() {
    let t = deploy(1_000);
    assert_eq!(mint(&t, &t.a, 600), Ok(()));
    assert_eq!(mint(&t, &t.b, 400), Ok(()));
    assert_eq!(client(&t).total_supply(), 1_000);
    assert_eq!(mint(&t, &t.a, 1), Err(Ok(Error::CapExceeded)));
    assert_eq!(mint(&t, &t.other, 1_000), Err(Ok(Error::CapExceeded)));
    assert_eq!((client(&t).total_supply(), client(&t).balance(&t.a), client(&t).balance(&t.b)), (1_000, 600, 400));
    // moving tokens does not change the supply or free any headroom
    assert_eq!(transfer(&t, &t.a, &t.b, 100), Ok(()));
    assert_eq!(mint(&t, &t.a, 1), Err(Ok(Error::CapExceeded)));
}

#[test]
fn a_mint_that_would_overflow_the_supply_is_rejected_without_a_write() {
    let t = deploy(i128::MAX);
    assert_eq!(mint(&t, &t.a, i128::MAX), Ok(()));
    assert_eq!(mint(&t, &t.b, 1), Err(Ok(Error::Overflow)));
    assert_eq!(mint(&t, &t.b, i128::MAX), Err(Ok(Error::Overflow)));
    assert_eq!((client(&t).total_supply(), client(&t).balance(&t.a), client(&t).balance(&t.b)), (i128::MAX, i128::MAX, 0));
}

#[test]
fn only_the_minter_can_mint_and_only_exactly_what_it_signed() {
    let t = deploy(1_000);
    for stranger in [&t.a, &t.other] {
        assert_eq!(mint_as(&t, stranger, &t.a, 10, 10), Err(Err(())), "a non-minter signs");
    }
    assert_eq!(mint_as(&t, &t.minter, &t.a, 11, 10), Err(Err(())), "the minter signed 10, the call carries 11");
    let c = client(&t);
    assert_eq!((c.total_supply(), c.balance(&t.a)), (0, 0));
    assert_eq!(mint_as(&t, &t.minter, &t.a, 10, 10), Ok(()));
    // the minter is fixed for good: it is still the same account
    assert_eq!(c.minter(), t.minter);
}

#[test]
fn amounts_must_be_positive() {
    let t = deploy(1_000);
    assert_eq!(mint(&t, &t.a, 0), Err(Ok(Error::BadAmount)));
    assert_eq!(mint(&t, &t.a, -5), Err(Ok(Error::BadAmount)));
    mint(&t, &t.a, 10).unwrap();
    assert_eq!(transfer(&t, &t.a, &t.b, 0), Err(Ok(Error::BadAmount)));
    assert_eq!(transfer(&t, &t.a, &t.b, -1), Err(Ok(Error::BadAmount)));
    assert_eq!(client(&t).total_supply(), 10);
}

#[test]
fn a_transfer_needs_the_owners_authorization_of_exactly_those_arguments() {
    let t = deploy(1_000);
    mint(&t, &t.a, 100).unwrap();
    assert_eq!(transfer_as(&t, &t.b, &t.a, &t.b, 10, 10), Err(Err(())), "the recipient signs instead of the owner");
    assert_eq!(transfer_as(&t, &t.minter, &t.a, &t.b, 10, 10), Err(Err(())), "even the minter cannot move another account's tokens");
    assert_eq!(transfer_as(&t, &t.a, &t.a, &t.b, 11, 10), Err(Err(())), "signed 10, carried 11");
    // signed for another recipient
    let inv = MockAuthInvoke { contract: &t.id, fn_name: "transfer", args: (&t.a, &t.other, &10i128).into_val(&t.env), sub_invokes: &[] };
    let auths = [MockAuth { address: &t.a, invoke: &inv }];
    assert!(client(&t).mock_auths(&auths).try_transfer(&t.a, &t.b, &10).is_err());
    assert_eq!((client(&t).balance(&t.a), client(&t).balance(&t.b)), (100, 0));
    assert_eq!(transfer(&t, &t.a, &t.b, 10), Ok(()));
    assert_eq!((client(&t).balance(&t.a), client(&t).balance(&t.b)), (90, 10));
}

#[test]
fn an_overdraft_fails_and_has_no_partial_effect() {
    let t = deploy(1_000);
    mint(&t, &t.a, 10).unwrap();
    assert_eq!(transfer(&t, &t.a, &t.b, 11), Err(Ok(Error::InsufficientBalance)));
    assert_eq!(transfer(&t, &t.b, &t.a, 1), Err(Ok(Error::InsufficientBalance)));
    assert_eq!((client(&t).balance(&t.a), client(&t).balance(&t.b), client(&t).total_supply()), (10, 0, 10));
    assert_eq!(transfer(&t, &t.a, &t.a, 10), Ok(())); // a self-transfer changes nothing
    assert_eq!(client(&t).balance(&t.a), 10);
}

#[test]
fn the_sum_of_balances_always_equals_the_supply_and_never_exceeds_the_cap() {
    // a deterministic pseudo-random walk of mints and transfers (no allowance, burn or other way to change the supply exists)
    let t = deploy(500);
    let who = [t.a.clone(), t.b.clone(), t.other.clone(), t.minter.clone()];
    let mut x: u64 = 0x2545F4914F6CDD1D;
    let mut next = || {
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        x
    };
    for _ in 0..300 {
        let (i, j, amt) = ((next() % 4) as usize, (next() % 4) as usize, (next() % 120) as i128 - 10);
        if next() % 3 == 0 {
            let _ = mint(&t, &who[i], amt);
        } else {
            let _ = transfer(&t, &who[i], &who[j], amt);
        }
        let sum: i128 = who.iter().map(|a| client(&t).balance(a)).sum();
        assert_eq!(sum, client(&t).total_supply());
        assert!(client(&t).total_supply() <= client(&t).cap());
        assert!(who.iter().all(|a| client(&t).balance(a) >= 0));
    }
}
