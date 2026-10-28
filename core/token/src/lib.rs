//! TobinTestToken: a custom Soroban token with a HARD SUPPLY CAP, for the Tobin experimental MVP-1.
//!
//! TEST INSTRUMENT ONLY. Not production-grade, no real value, never to be described as an asset for real-value settlement.
//!
//! Policy chosen for this milestone (founder decision DB-14 fixed only "custom Soroban token with a capped supply"; the rest is an
//! engineering choice, EQ-08, documented here and in `core/README.md`):
//! * One minter, fixed at construction. The minter can mint; it cannot be changed, transferred, revoked or restored.
//! * One cap, fixed at construction, strictly positive, never changed. `total_supply <= cap` always: `mint` checks
//!   `total_supply + amount <= cap` with checked arithmetic BEFORE any write.
//! * No burn, so the supply never decreases and a re-mint after a burn cannot exist; total supply only grows, up to the cap.
//! * No allowance, `approve` or `transfer_from`: the clearing contract moves funds only through the owner's own authorization of the
//!   exact transfer (baseline S9: no escrow or standing allowance model).
//! * Only the interface the clearing contract uses plus queries: `mint`, `transfer`, `balance`, `total_supply`, `cap`, `minter`,
//!   `decimals`, `name`, `symbol`. This is a SUBSET of the standard Soroban token interface (SEP-41), not a full implementation.
//! * All balance, supply and cap arithmetic is checked. Amounts must be strictly positive.
#![no_std]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, Address, Env, String,
};

/// Provisional storage-lifetime parameters in ledgers (about 30 and 60 days at 5 s per ledger). [MEASURE]: not chosen from any
/// measurement.
const LIFETIME_THRESHOLD: u32 = 17_280 * 30;
const LIFETIME_EXTEND: u32 = 17_280 * 60;

/// Codes start at 101 so that they never read as one of the clearing contract's codes (1 to 90) when a token error is passed
/// through `settle` unchanged.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    /// amount is zero or negative
    BadAmount = 101,
    /// balance of `from` is below the amount
    InsufficientBalance = 102,
    /// minting would take the total supply above the cap
    CapExceeded = 103,
    /// checked arithmetic failed
    Overflow = 104,
    /// the cap given at construction is not strictly positive
    BadCap = 105,
}

#[contracttype]
enum Key {
    Minter,
    Cap,
    Total,
    Decimals,
    Name,
    Symbol,
    Balance(Address),
}

#[contractevent]
pub struct Mint {
    #[topic]
    pub to: Address,
    pub amount: i128,
}

#[contractevent]
pub struct Transfer {
    #[topic]
    pub from: Address,
    #[topic]
    pub to: Address,
    pub amount: i128,
}

#[contract]
pub struct TobinTestToken;

#[contractimpl]
impl TobinTestToken {
    /// Runs once at deployment. `minter` is the only account that can ever mint; `cap` is the hard, immutable supply cap.
    pub fn __constructor(
        env: Env,
        minter: Address,
        cap: i128,
        decimals: u32,
        name: String,
        symbol: String,
    ) -> Result<(), Error> {
        if cap <= 0 {
            return Err(Error::BadCap);
        }
        let s = env.storage().instance();
        s.set(&Key::Minter, &minter);
        s.set(&Key::Cap, &cap);
        s.set(&Key::Total, &0i128);
        s.set(&Key::Decimals, &decimals);
        s.set(&Key::Name, &name);
        s.set(&Key::Symbol, &symbol);
        Ok(())
    }

    /// Mint `amount` to `to`. Requires the minter's authorization of exactly (to, amount). Fails, writing nothing, when the total
    /// supply would exceed the cap.
    pub fn mint(env: Env, to: Address, amount: i128) -> Result<(), Error> {
        let minter: Address = env.storage().instance().get(&Key::Minter).unwrap();
        minter.require_auth();
        if amount <= 0 {
            return Err(Error::BadAmount);
        }
        let cap: i128 = env.storage().instance().get(&Key::Cap).unwrap();
        let total: i128 = env.storage().instance().get(&Key::Total).unwrap();
        let new_total = total.checked_add(amount).ok_or(Error::Overflow)?;
        if new_total > cap {
            return Err(Error::CapExceeded);
        }
        let new_bal = balance_of(&env, &to)
            .checked_add(amount)
            .ok_or(Error::Overflow)?;
        set_balance(&env, &to, new_bal);
        env.storage().instance().set(&Key::Total, &new_total);
        extend_instance(&env);
        Mint { to, amount }.publish(&env);
        Ok(())
    }

    /// Move `amount` from `from` to `to`. Requires `from`'s authorization of exactly (from, to, amount). All-or-nothing.
    pub fn transfer(env: Env, from: Address, to: Address, amount: i128) -> Result<(), Error> {
        from.require_auth();
        if amount <= 0 {
            return Err(Error::BadAmount);
        }
        let from_bal = balance_of(&env, &from);
        if from_bal < amount {
            return Err(Error::InsufficientBalance);
        }
        if from != to {
            let to_bal = balance_of(&env, &to)
                .checked_add(amount)
                .ok_or(Error::Overflow)?;
            set_balance(&env, &from, from_bal - amount); // cannot underflow: checked above
            set_balance(&env, &to, to_bal);
        }
        extend_instance(&env);
        Transfer { from, to, amount }.publish(&env);
        Ok(())
    }

    pub fn balance(env: Env, id: Address) -> i128 {
        balance_of(&env, &id)
    }
    pub fn total_supply(env: Env) -> i128 {
        env.storage().instance().get(&Key::Total).unwrap()
    }
    pub fn cap(env: Env) -> i128 {
        env.storage().instance().get(&Key::Cap).unwrap()
    }
    pub fn minter(env: Env) -> Address {
        env.storage().instance().get(&Key::Minter).unwrap()
    }
    pub fn decimals(env: Env) -> u32 {
        env.storage().instance().get(&Key::Decimals).unwrap()
    }
    pub fn name(env: Env) -> String {
        env.storage().instance().get(&Key::Name).unwrap()
    }
    pub fn symbol(env: Env) -> String {
        env.storage().instance().get(&Key::Symbol).unwrap()
    }
}

fn balance_of(env: &Env, id: &Address) -> i128 {
    env.storage()
        .persistent()
        .get(&Key::Balance(id.clone()))
        .unwrap_or(0)
}

fn set_balance(env: &Env, id: &Address, v: i128) {
    let k = Key::Balance(id.clone());
    env.storage().persistent().set(&k, &v);
    env.storage()
        .persistent()
        .extend_ttl(&k, LIFETIME_THRESHOLD, LIFETIME_EXTEND);
}

fn extend_instance(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(LIFETIME_THRESHOLD, LIFETIME_EXTEND);
}
