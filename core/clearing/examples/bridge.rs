//! LOCAL DEVELOPMENT BRIDGE (dev-only example; not a contract, not deployable, no network).
//!
//! Hosts the real `TobinClearingV1` and `TobinTestToken` in the Soroban test host (soroban-env-host 29) and speaks JSON lines on
//! stdin/stdout, so that the TypeScript engine, SDK tests and the local Console talk to the REAL contract code instead of a TypeScript
//! re-implementation. Every invocation can carry explicit authorization trees; they are applied with `mock_auths`, so the real contract
//! still enforces `require_auth` / `require_auth_for_args` against exactly the tree the caller states. These are simulated local
//! authorizations (no signatures, no wallet, no transaction, no network). `mock_auths` needs contract-kind signers, so the default world
//! uses generated (C...) actors; `--accounts` makes classic (G...) accounts instead, with `mock_all_auths` (no enforcement), which is
//! only used to produce digest fixtures for account addresses.
//!
//! Protocol (one JSON object per line, one JSON reply per line):
//!   {"cmd":"actor","name":"alice","kind":"contract"|"account"} -> {"ok":true,"address":"C..."}   (kind optional)
//!   {"cmd":"token","name":"ttt","minter":"alice","cap":"1000000"} -> {"ok":true,"address":"C..."}
//!   {"cmd":"clearing"}                                  -> {"ok":true,"address":"C..."}    (deploys one clearing contract)
//!   {"cmd":"invoke","contract":"C...","fn":"settle","args":[ScArg...],"auths":[{"who":"C...","root":Invocation}]}
//!        -> {"ok":true,"value":<json>,"eventCount":n,"resources":{...}} | {"ok":false,"errorType":"Contract"|"Auth"|...,"code":n}
//!   {"cmd":"ledger","sequence":n}                       -> sets the ledger sequence
//!   {"cmd":"network"}                                 -> {"ok":true,"networkId":"<64 hex>"}
//! ScArg: {"t":"addr"|"bytes32"|"i128"|"u32"|"string"|"obligation"|"instructions","v":...}
//! Invocation: {"contract":"C...","fn":"transfer","args":[ScArg...],"subs":[Invocation...]}
use ed25519_dalek::SigningKey;
use serde_json::{json, Value};
use soroban_sdk::{
    testutils::{Address as _, EnvTestConfig, Events as _, Ledger as _, MockAuth, MockAuthInvoke},
    xdr,
    Address, BytesN, Env, IntoVal, String as SStr, Symbol, TryFromVal, Val, Vec as SVec,
};
use std::collections::HashMap;
use std::io::{BufRead, Write};
use std::rc::Rc;
use tobin_clearing_v1::{Instruction, Obligation, TobinClearingV1};
use tobin_test_token::TobinTestToken;

struct World {
    env: Env,
    accounts: bool,
    actors: HashMap<String, Address>,
    next_seed: u8,
}

fn addr_str(a: &Address) -> String {
    let s = a.to_string();
    let mut buf = vec![0u8; s.len() as usize];
    s.copy_into_slice(&mut buf);
    String::from_utf8(buf).unwrap()
}

fn hex(b: &[u8]) -> String {
    b.iter().map(|x| format!("{x:02x}")).collect()
}

fn unhex(s: &str) -> Vec<u8> {
    (0..s.len() / 2).map(|i| u8::from_str_radix(&s[2 * i..2 * i + 2], 16).unwrap()).collect()
}

fn account(env: &Env, seed: u8) -> Address {
    let key = SigningKey::from_bytes(&[seed; 32]);
    let id = xdr::AccountId(xdr::PublicKey::PublicKeyTypeEd25519(xdr::Uint256(key.verifying_key().to_bytes())));
    let entry_key = Rc::new(xdr::LedgerKey::Account(xdr::LedgerKeyAccount { account_id: id.clone() }));
    let entry = Rc::new(xdr::LedgerEntry {
        last_modified_ledger_seq: 0,
        data: xdr::LedgerEntryData::Account(xdr::AccountEntry {
            account_id: id.clone(),
            balance: 0,
            seq_num: xdr::SequenceNumber(0),
            num_sub_entries: 1,
            inflation_dest: None,
            flags: 0,
            home_domain: Default::default(),
            thresholds: xdr::Thresholds([1, 1, 1, 1]),
            signers: xdr::VecM::default(),
            ext: xdr::AccountEntryExt::V0,
        }),
        ext: xdr::LedgerEntryExt::V0,
    });
    env.host().add_ledger_entry(&entry_key, &entry, None).unwrap();
    Address::try_from_val(env, &xdr::ScAddress::Account(id)).unwrap()
}

fn addr(env: &Env, v: &Value) -> Address {
    Address::from_str(env, v.as_str().expect("address string"))
}

fn bytes32(env: &Env, v: &Value) -> BytesN<32> {
    let raw = unhex(v.as_str().expect("hex string"));
    let mut a = [0u8; 32];
    a.copy_from_slice(&raw);
    BytesN::from_array(env, &a)
}

fn i128v(v: &Value) -> i128 {
    v.as_str().expect("i128 as decimal string").parse().expect("i128")
}

fn obligation(env: &Env, v: &Value) -> Obligation {
    Obligation { id: bytes32(env, &v["id"]), debtor: addr(env, &v["debtor"]), creditor: addr(env, &v["creditor"]), amount: i128v(&v["amount"]) }
}

fn instructions(env: &Env, v: &Value) -> SVec<Instruction> {
    let mut out = SVec::new(env);
    for i in v.as_array().expect("instruction array") {
        out.push_back(Instruction { payer: addr(env, &i["payer"]), payee: addr(env, &i["payee"]), amount: i128v(&i["amount"]) });
    }
    out
}

/// A tagged JSON argument to a Soroban `Val`.
fn scarg(env: &Env, a: &Value) -> Val {
    let v = &a["v"];
    match a["t"].as_str().expect("arg tag") {
        "addr" => addr(env, v).into_val(env),
        "bytes32" => bytes32(env, v).into_val(env),
        "i128" => i128v(v).into_val(env),
        "u32" => (v.as_u64().expect("u32") as u32).into_val(env),
        "string" => SStr::from_str(env, v.as_str().expect("string")).into_val(env),
        "obligation" => obligation(env, v).into_val(env),
        "instructions" => instructions(env, v).into_val(env),
        t => panic!("unknown arg tag {t}"),
    }
}

fn args_vec(env: &Env, args: &Value) -> SVec<Val> {
    let mut v = SVec::new(env);
    for a in args.as_array().expect("args array") {
        v.push_back(scarg(env, a));
    }
    v
}

/// Owned form of an authorization tree, so `MockAuthInvoke` (which borrows) can be built from it.
struct Inv {
    contract: Address,
    name: String,
    args: SVec<Val>,
    subs: Vec<Inv>,
}

fn inv(env: &Env, v: &Value) -> Inv {
    Inv {
        contract: addr(env, &v["contract"]),
        name: v["fn"].as_str().expect("fn").to_string(),
        args: args_vec(env, &v["args"]),
        subs: v["subs"].as_array().map(|s| s.iter().map(|x| inv(env, x)).collect()).unwrap_or_default(),
    }
}

/// MockAuthInvoke borrows its contents, so each request's (small) tree is leaked for 'static: a local development tool, short-lived process.
fn leak(i: &Inv) -> MockAuthInvoke<'static> {
    let contract: &'static Address = Box::leak(Box::new(i.contract.clone()));
    let name: &'static str = Box::leak(i.name.clone().into_boxed_str());
    let subs: Vec<MockAuthInvoke<'static>> = i.subs.iter().map(leak).collect();
    MockAuthInvoke { contract, fn_name: name, args: i.args.clone(), sub_invokes: Box::leak(subs.into_boxed_slice()) }
}

fn to_json(env: &Env, val: Val) -> Value {
    let sc = xdr::ScVal::try_from_val(env, &val).expect("val to ScVal");
    sc_json(env, &sc)
}

fn sc_json(env: &Env, sc: &xdr::ScVal) -> Value {
    match sc {
        xdr::ScVal::Void => Value::Null,
        xdr::ScVal::Bool(b) => json!(b),
        xdr::ScVal::U32(n) => json!(n),
        xdr::ScVal::I32(n) => json!(n),
        xdr::ScVal::U64(n) => json!(n.to_string()),
        xdr::ScVal::I64(n) => json!(n.to_string()),
        xdr::ScVal::I128(p) => json!((((p.hi as i128) << 64) | p.lo as i128).to_string()),
        xdr::ScVal::Bytes(b) => json!(hex(&b.0)),
        xdr::ScVal::Address(a) => json!(addr_str(&Address::try_from_val(env, &xdr::ScVal::Address(a.clone())).unwrap())),
        xdr::ScVal::String(s) => json!(s.to_utf8_string_lossy()),
        xdr::ScVal::Symbol(s) => json!(s.to_utf8_string_lossy()),
        xdr::ScVal::Vec(Some(v)) => Value::Array(v.0.iter().map(|x| sc_json(env, x)).collect()),
        xdr::ScVal::Map(Some(m)) => {
            let mut o = serde_json::Map::new();
            for e in m.0.iter() {
                if let xdr::ScVal::Symbol(k) = &e.key {
                    o.insert(k.to_utf8_string_lossy(), sc_json(env, &e.val));
                }
            }
            Value::Object(o)
        }
        other => json!(format!("{other:?}")),
    }
}

fn invoke(w: &World, req: &Value) -> Value {
    let env = &w.env;
    let contract = addr(env, &req["contract"]);
    let fname = req["fn"].as_str().expect("fn");
    let args = args_vec(env, &req["args"]);
    // explicit authorization trees (enforcing world only)
    let owned: Vec<(Address, Inv)> = req["auths"]
        .as_array()
        .map(|a| a.iter().map(|x| (addr(env, &x["who"]), inv(env, &x["root"]))).collect())
        .unwrap_or_default();
    if !w.accounts {
        let auths: Vec<MockAuth<'static>> = owned
            .iter()
            .map(|(who, root)| {
                let who: &'static Address = Box::leak(Box::new(who.clone()));
                let root: &'static MockAuthInvoke<'static> = Box::leak(Box::new(leak(root)));
                MockAuth { address: who, invoke: root }
            })
            .collect();
        env.mock_auths(&auths);
    }
    run(env, &contract, fname, args)
}

/// Pull `Error(Type, Code)` out of a host panic message such as "HostError: Error(Auth, InvalidAction)" or "... Error(Contract, #2) ...".
fn parse_error(msg: &str) -> Option<(String, String)> {
    let i = msg.find("Error(")?;
    let rest = &msg[i + 6..];
    let j = rest.find(')')?;
    let mut parts = rest[..j].splitn(2, ", ");
    Some((parts.next()?.to_string(), parts.next()?.to_string()))
}

/// Invoke without `try_`: a failed call then panics in the SDK with the REAL host error text (`try_invoke_contract` and the host's `try_call`
/// narrow every non-contract error to Context/InvalidAction, and the diagnostic log does not reliably record repeated failures). The panic is
/// caught here and turned into a structured error; the host has already unwound its frames when the SDK panics.
fn run(env: &Env, contract: &Address, fname: &str, args: SVec<Val>) -> Value {
    let res = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| env.invoke_contract::<Val>(contract, &Symbol::new(env, fname), args)));
    let events = env.events().all().events().len();
    let r = env.cost_estimate().resources();
    let resources = json!({ "instructions": r.instructions, "memBytes": r.mem_bytes, "writeEntries": r.write_entries, "writeBytes": r.write_bytes });
    match res {
        Ok(v) => json!({ "ok": true, "value": to_json(env, v), "eventCount": events, "resources": resources }),
        Err(payload) => {
            let msg = payload.downcast_ref::<String>().cloned().or_else(|| payload.downcast_ref::<&str>().map(|s| s.to_string())).unwrap_or_default();
            match parse_error(&msg) {
                Some((ty, code)) => {
                    // a contract error reads `#N`; a host error reads a name such as InvalidAction
                    let n = code.trim_start_matches('#').parse::<u32>().ok();
                    json!({ "ok": false, "errorType": ty, "code": n, "codeName": code })
                }
                None => json!({ "ok": false, "errorType": "Invoke", "code": null, "detail": msg }),
            }
        }
    }
}

fn handle(w: &mut World, req: &Value) -> Value {
    let env = w.env.clone();
    match req["cmd"].as_str().unwrap_or("") {
        "actor" => {
            let name = req["name"].as_str().unwrap().to_string();
            let a = match w.actors.get(&name) {
                Some(a) => a.clone(),
                None => {
                    let want_account = match req["kind"].as_str() {
                        Some("account") => true,
                        Some("contract") => false,
                        _ => w.accounts,
                    };
                    let a = if want_account {
                        w.next_seed += 1;
                        account(&env, 20 + w.next_seed)
                    } else {
                        Address::generate(&env)
                    };
                    w.actors.insert(name, a.clone());
                    a
                }
            };
            json!({ "ok": true, "address": addr_str(&a) })
        }
        "token" => {
            let minter = addr(&env, &req["minter"]);
            let cap = i128v(&req["cap"]);
            let t = env.register(TobinTestToken, (minter, cap, 7u32, SStr::from_str(&env, "Tobin Test Token"), SStr::from_str(&env, "TTT")));
            json!({ "ok": true, "address": addr_str(&t) })
        }
        "clearing" => {
            let c = env.register(TobinClearingV1, ());
            json!({ "ok": true, "address": addr_str(&c) })
        }
        "network" => json!({ "ok": true, "networkId": hex(&env.ledger().network_id().to_array()) }),
        "ledger" => {
            env.ledger().with_mut(|l| l.sequence_number = req["sequence"].as_u64().unwrap() as u32);
            json!({ "ok": true })
        }
        "invoke" => invoke(w, req),
        c => json!({ "ok": false, "errorType": "Protocol", "code": 0, "detail": format!("unknown cmd {c}") }),
    }
}

fn main() {
    std::panic::set_hook(Box::new(|_| {}));
    let accounts = std::env::args().any(|a| a == "--accounts");
    let env = Env::new_with_config(EnvTestConfig { capture_snapshot_at_drop: false });
    if accounts {
        env.mock_all_auths();
    }
    let mut w = World { env, accounts, actors: HashMap::new(), next_seed: 0 };
    let stdin = std::io::stdin();
    let mut out = std::io::stdout();
    for line in stdin.lock().lines() {
        let line = line.unwrap();
        if line.trim().is_empty() {
            continue;
        }
        let req: Value = match serde_json::from_str(&line) {
            Ok(v) => v,
            Err(e) => {
                writeln!(out, "{}", json!({ "ok": false, "errorType": "Protocol", "code": 0, "detail": e.to_string() })).unwrap();
                out.flush().unwrap();
                continue;
            }
        };
        let reply = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| handle(&mut w, &req)))
            .unwrap_or_else(|_| json!({ "ok": false, "errorType": "Bridge", "code": 0, "detail": "the bridge panicked while handling this request" }));
        writeln!(out, "{reply}").unwrap();
        out.flush().unwrap();
    }
}
