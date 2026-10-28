//! Parity of the TypeScript-built expected intents with what the REAL contracts demand. tests/fixtures/intents-all-calls-v1.json holds, for every
//! supported signing call (create_session, join_session, submit_obligation, finalize_obligations, propose_settlement, approve_settlement, settle, mint),
//! the intent the TypeScript SDK builds for fixed synthetic parties (test/fixtures/generate-intents.ts). This test replays the same calls against the
//! real contracts in the Soroban host (contracts registered at the fixture's fixed addresses) and compares, call by call, the invocation trees the HOST
//! recorded as requiring authorization with the trees the Rust verifier parsed from the intent: same signer, same contract, function, typed arguments and
//! nested calls. It also checks that the DB-09 v2 digest the TypeScript code computed is the digest the contract returned. Offline.
//! Shows the encodings agree in the host; it does not show that an RPC, a wallet or a network produces or accepts the same trees.
#![cfg(test)]
mod support;
#[path = "../signer/mod.rs"]
#[allow(dead_code)]
mod signer;
use serde_json::Value;
use signer::*;
use soroban_sdk::{
    testutils::{AuthorizedFunction, AuthorizedInvocation},
    xdr, Address, BytesN, Env, String as SStr, TryFromVal, Val, Vec as SVec,
};
use support::*;
use tobin_clearing_v1::{Instruction, Obligation, TobinClearingV1, TobinClearingV1Client};
use tobin_test_token::{TobinTestToken, TobinTestTokenClient};

fn fx() -> Value {
    serde_json::from_str(include_str!("fixtures/intents-all-calls-v1.json")).unwrap()
}
fn hex32(env: &Env, h: &str) -> BytesN<32> {
    let b: Vec<u8> = (0..32).map(|i| u8::from_str_radix(&h[2 * i..2 * i + 2], 16).unwrap()).collect();
    BytesN::from_array(env, &b.try_into().unwrap())
}

fn to_xdr(env: &Env, inv: &AuthorizedInvocation) -> xdr::SorobanAuthorizedInvocation {
    let AuthorizedFunction::Contract((addr, name, args)) = &inv.function else { panic!("only contract calls are expected") };
    let name_val: Val = soroban_sdk::IntoVal::into_val(name, env);
    let xdr::ScVal::Symbol(sym) = xdr::ScVal::try_from_val(env, &name_val).unwrap() else { panic!() };
    xdr::SorobanAuthorizedInvocation {
        function: xdr::SorobanAuthorizedFunction::ContractFn(xdr::InvokeContractArgs {
            contract_address: addr.into(),
            function_name: sym,
            args: args.iter().map(|v| xdr::ScVal::try_from_val(env, &v).unwrap()).collect::<Vec<_>>().try_into().unwrap(),
        }),
        sub_invocations: inv.sub_invocations.iter().map(|s| to_xdr(env, s)).collect::<Vec<_>>().try_into().unwrap(),
    }
}

/// what the host recorded for the last call, as (signer key, tree) pairs
fn recorded(env: &Env) -> Vec<([u8; 32], xdr::SorobanAuthorizedInvocation)> {
    env.auths()
        .iter()
        .map(|(a, inv)| {
            let xdr::ScAddress::Account(xdr::AccountId(xdr::PublicKey::PublicKeyTypeEd25519(k))) = a.into() else { panic!("an account signer is expected") };
            (k.0, to_xdr(env, inv))
        })
        .collect()
}

/// the intent for `name` parsed by the Rust verifier against the pinned record
fn expected(dep: &DeploymentRecord, name: &str) -> ExpectedIntent {
    let v = fx();
    let call = v["calls"].as_array().unwrap().iter().find(|c| c["name"] == name).unwrap_or_else(|| panic!("no intent for {name}"));
    parse_intent(&call["intent"].to_string(), dep).unwrap_or_else(|e| panic!("{name}: the Rust verifier rejected the TypeScript intent: {e}"))
}

fn same(name: &str, env: &Env, it: &ExpectedIntent) {
    let got = recorded(env);
    assert_eq!(got.len(), it.entries.len(), "{name}: number of authorizations the host demanded");
    for (signer, tree) in &got {
        let n = it.entries.iter().filter(|e| e.signer == *signer && e.tree == *tree).count();
        assert_eq!(n, 1, "{name}: the host demands an authorization from {:02x?} that the intent does not state exactly once", &signer[..4]);
    }
}

#[test]
fn p0_every_supported_call_has_an_intent_that_equals_the_trees_the_real_contracts_demand() {
    let v = fx();
    let dep = parse_deployment(include_str!("fixtures/deployment.TEST-ONLY.json")).unwrap();
    let env = new_env();
    env.mock_all_auths();
    let addr = |s: &str| Address::from_str(&env, s);
    let p = &v["parties"];
    let (a, b, m) = (addr(p["creator_and_debtor"].as_str().unwrap()), addr(p["joiner_and_creditor"].as_str().unwrap()), addr(p["minter"].as_str().unwrap()));
    // the pinned record's own addresses are the ones the contracts are registered at
    let dep_v: Value = serde_json::from_str(include_str!("fixtures/deployment.TEST-ONLY.json")).unwrap();
    let (clearing_addr, token_addr) = (addr(dep_v["clearing"].as_str().unwrap()), addr(dep_v["token"].as_str().unwrap()));
    env.register_at(&token_addr, TobinTestToken, (m.clone(), 1_000_000i128, 7u32, SStr::from_str(&env, "Tobin Test Token"), SStr::from_str(&env, "TTT")));
    env.register_at(&clearing_addr, TobinClearingV1, ());
    let c = TobinClearingV1Client::new(&env, &clearing_addr);
    let t = TobinTestTokenClient::new(&env, &token_addr);
    let s = hex32(&env, v["session_hex"].as_str().unwrap());

    // mint (the token's fixed minter)
    t.mint(&a, &500);
    same("mint", &env, &expected(&dep, "mint"));

    c.create_session(&a, &s, &token_addr, &4, &16);
    same("create_session", &env, &expected(&dep, "create_session"));

    c.join_session(&s, &b);
    same("join_session", &env, &expected(&dep, "join_session"));

    let o = &v["obligation"];
    c.submit_obligation(&s, &Obligation { id: hex32(&env, o["id"].as_str().unwrap()), debtor: a.clone(), creditor: b.clone(), amount: 100 });
    same("submit_obligation", &env, &expected(&dep, "submit_obligation"));

    c.finalize_obligations(&s, &b);
    same("finalize_obligations", &env, &expected(&dep, "finalize_obligations"));

    let mut plan = SVec::new(&env);
    plan.push_back(Instruction { payer: a.clone(), payee: b.clone(), amount: 100 });
    let digest = c.propose_settlement(&s, &a, &plan);
    same("propose_settlement", &env, &expected(&dep, "propose_settlement"));
    let hex: String = digest.to_array().iter().map(|x| format!("{x:02x}")).collect();
    assert_eq!(hex, v["digest"].as_str().unwrap(), "the DB-09 v2 digest the TypeScript code computed is the one the contract returned");

    c.approve_settlement(&s, &b, &digest);
    same("approve_settlement", &env, &expected(&dep, "approve_settlement"));
    c.approve_settlement(&s, &a, &digest);

    c.settle(&s, &digest);
    same("settle", &env, &expected(&dep, "settle"));
    assert_eq!(t.balance(&b), 100, "the replayed settlement really moved the tokens");
}
