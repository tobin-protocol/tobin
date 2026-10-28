//! Narrow local-only Soroban authorization-entry signer for disposable TEST keys (Milestone 8, Stage B). NOT a wallet, NOT part of any contract.
//!
//! WHAT IT SIGNS (the construction the Stellar SDKs' `authorizeEntry` uses; an independent JavaScript implementation matches it byte for byte, see
//! tests/authvectors.rs):
//!   payload    = SHA-256( XDR( HashIdPreimage::SorobanAuthorization { network_id, nonce, signature_expiration_ledger, invocation } ) )
//!   network_id = SHA-256( network passphrase )
//!   signature  = ed25519 over the 32 payload bytes
//! written into the entry's legacy `Address` credentials as `Vec[ Map{ "public_key": Bytes(32), "signature": Bytes(64) } ]`. The recorded `nonce` and
//! `invocation` tree are never rewritten.
//!
//! MANDATORY EXPECTED INTENT (F2, founder-approved). There is no blind-signing mode. An entry is signed only if its whole invocation tree equals, as typed
//! XDR structures, a tree in an `ExpectedIntent` that was produced from a source OTHER THAN the simulation response being signed (the TypeScript SDK builds
//! it from the digest-verified settlement state, or from the user's own request, plus a pinned `DeploymentRecord`). The signer never derives intent from the
//! envelope it is validating. Validation order: limits -> expiry policy -> envelope shape -> credential kinds -> entry/intent matching -> signing of a
//! working copy. Nothing is signed until everything has been checked, and the caller's envelope is replaced only when every requested signature succeeded.
//!
//! WHAT THE SIGNER CAN AND CANNOT ESTABLISH. It verifies that the tree equals the intent, that the intent is internally consistent (for settlement: the
//! total is the sum of the transfers, payer is the signer, transfers go to distinct payees in the contract's order) and that every contract it names is the
//! pinned clearing or token contract. It cannot establish that the intent is what the user wants (that is the intent builder's provenance), that the pinned
//! contracts are honest, or what the current ledger is. TRUST BOUNDARIES kept on purpose: (1) `current_ledger` is supplied by the caller and cannot be
//! checked offline; (2) the pinned deployment record is a trust anchor, not proof of anything about the deployed code.
//!
//! EXPIRY POLICY (founder decisions, EQ-20): `current < expiration <= current + 10`, checked arithmetic, never clamped. 10 ledgers is policy, not a measured
//! or network-validated value. CREDENTIALS: only legacy `Address`; `AddressV2`, `AddressWithDelegates` and `SourceAccount` entries make the call fail.
//!
//! INPUT LIMITS (all enforced before anything is decoded or signed): envelope at most `MAX_ENVELOPE_BYTES` (128 KiB, in line with the Stellar transaction size
//! ceiling and far above any MVP-1 transaction, which is under 4 KiB in Stage B), XDR nesting depth at most `XDR_DEPTH_LIMIT`, at most `MAX_AUTH_ENTRIES` entries,
//! invocation trees at most `MAX_TREE_DEPTH` deep and `MAX_TREE_NODES` nodes (a settlement tree has 1 + at most 16 nodes), `MAX_JSON_BYTES` for the intent and
//! deployment files. These are conservative local limits, not network limits.
use ed25519_dalek::{Signer, SigningKey};
use serde_json::{Map, Value};
use sha2::{Digest, Sha256};
use soroban_sdk::xdr::{
    self, Hash, HashIdPreimage, HashIdPreimageSorobanAuthorization, Limits, OperationBody, ScAddress, ScBytes, ScMap, ScMapEntry, ScVal, ScVec,
    SorobanAddressCredentials, SorobanAuthorizationEntry, SorobanAuthorizedInvocation, SorobanCredentials, TransactionEnvelope, WriteXdr,
};

/// Founder-approved maximum authorization lifetime, in ledgers beyond the current ledger (EQ-20).
pub const MAX_AUTH_LIFETIME_LEDGERS: u32 = 10;
pub const INTENT_VERSION: u64 = 1;
pub const DEPLOYMENT_VERSION: u64 = 1;
pub const MAX_ENVELOPE_BYTES: usize = 128 * 1024;
pub const MAX_JSON_BYTES: usize = 256 * 1024;
pub const XDR_DEPTH_LIMIT: u32 = 200;
pub const MAX_AUTH_ENTRIES: usize = 32;
pub const MAX_TREE_DEPTH: usize = 6;
pub const MAX_TREE_NODES: usize = 40;
const MAX_VEC_ITEMS: usize = 64;
const MAX_ARGS: usize = 8;

// ------------------------------------------------------------------------------------------------------------------------------------------
// expiry policy
// ------------------------------------------------------------------------------------------------------------------------------------------

/// Validate an expiration against the caller-supplied current ledger. Returns the expiration unchanged or an error; never adjusts it.
pub fn check_expiry(current_ledger: Option<u32>, expiration_ledger: u32) -> Result<u32, String> {
    let current = current_ledger.ok_or("the current ledger is required and was not supplied (fail closed)")?;
    if current == 0 {
        return Err("the current ledger is invalid (zero)".into());
    }
    if expiration_ledger == 0 {
        return Err("expiration ledger must be explicit and non-zero".into());
    }
    if expiration_ledger <= current {
        return Err(format!("expiration ledger {expiration_ledger} is not after the current ledger {current}"));
    }
    let latest = current.checked_add(MAX_AUTH_LIFETIME_LEDGERS).ok_or("current ledger plus the maximum lifetime overflows u32")?;
    if expiration_ledger > latest {
        return Err(format!("expiration ledger {expiration_ledger} is more than {MAX_AUTH_LIFETIME_LEDGERS} ledgers after the current ledger {current}"));
    }
    Ok(expiration_ledger)
}

pub fn network_id(passphrase: &str) -> [u8; 32] {
    Sha256::digest(passphrase.as_bytes()).into()
}

// ------------------------------------------------------------------------------------------------------------------------------------------
// strkeys (G.. C.. S..), checksum-verified; errors never echo the input
// ------------------------------------------------------------------------------------------------------------------------------------------

fn crc16_xmodem(data: &[u8]) -> u16 {
    let mut crc: u16 = 0;
    for &b in data {
        crc ^= (b as u16) << 8;
        for _ in 0..8 {
            crc = if crc & 0x8000 != 0 { (crc << 1) ^ 0x1021 } else { crc << 1 };
        }
    }
    crc
}

const VERSION_ACCOUNT: u8 = 6 << 3;
const VERSION_CONTRACT: u8 = 2 << 3;
const VERSION_SEED: u8 = 18 << 3;

fn strkey_decode(s: &str) -> Result<(u8, [u8; 32]), String> {
    if s.len() != 56 {
        return Err("a strkey must be 56 characters".into());
    }
    let mut bits: u64 = 0;
    let mut nbits = 0u32;
    let mut out = Vec::with_capacity(35);
    for c in s.bytes() {
        let v = match c {
            b'A'..=b'Z' => c - b'A',
            b'2'..=b'7' => c - b'2' + 26,
            _ => return Err("invalid base32 character".into()),
        } as u64;
        bits = (bits << 5) | v;
        nbits += 5;
        if nbits >= 8 {
            nbits -= 8;
            out.push(((bits >> nbits) & 0xff) as u8);
        }
    }
    if out.len() != 35 {
        return Err("wrong strkey length".into());
    }
    if crc16_xmodem(&out[..33]) != u16::from_le_bytes([out[33], out[34]]) {
        return Err("strkey checksum mismatch".into());
    }
    let mut key = [0u8; 32];
    key.copy_from_slice(&out[1..33]);
    Ok((out[0], key))
}

/// Decode an `S...` strkey secret seed. Errors never contain the input.
pub fn parse_secret(s: &str) -> Result<SigningKey, String> {
    let s = s.trim();
    if !s.starts_with('S') {
        return Err("not a secret-seed strkey".into());
    }
    let (version, seed) = strkey_decode(s)?;
    if version != VERSION_SEED {
        return Err("wrong strkey version".into());
    }
    Ok(SigningKey::from_bytes(&seed))
}

fn address_of(s: &str) -> Result<ScAddress, String> {
    let (version, key) = strkey_decode(s)?;
    match (s.as_bytes()[0], version) {
        (b'G', VERSION_ACCOUNT) => Ok(ScAddress::Account(xdr::AccountId(xdr::PublicKey::PublicKeyTypeEd25519(xdr::Uint256(key))))),
        (b'C', VERSION_CONTRACT) => Ok(ScAddress::Contract(xdr::ContractId(Hash(key)))),
        _ => Err("only account (G...) and contract (C...) addresses are accepted".into()),
    }
}

fn account_key(a: &ScAddress) -> Option<[u8; 32]> {
    match a {
        ScAddress::Account(xdr::AccountId(xdr::PublicKey::PublicKeyTypeEd25519(k))) => Some(k.0),
        _ => None,
    }
}

fn contract_id(a: &ScAddress) -> Option<[u8; 32]> {
    match a {
        ScAddress::Contract(xdr::ContractId(Hash(k))) => Some(*k),
        _ => None,
    }
}

fn short(k: &[u8; 32]) -> String {
    k[..4].iter().map(|b| format!("{b:02x}")).collect()
}

// ------------------------------------------------------------------------------------------------------------------------------------------
// pinned deployment record and typed expected intent
// ------------------------------------------------------------------------------------------------------------------------------------------

/// The pinned deployment record: the network passphrase and the two contract identities every intent must stay inside. It holds no secrets. It is a
/// TRUST ANCHOR chosen by the operator, not proof that the contracts are honest or deployed as claimed.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DeploymentRecord {
    pub network_passphrase: String,
    pub clearing: [u8; 32],
    pub token: [u8; 32],
}

#[derive(Debug, Clone, PartialEq)]
pub struct ExpectedEntry {
    /// the account key (ed25519) that must authorize exactly this tree
    pub signer: [u8; 32],
    pub tree: SorobanAuthorizedInvocation,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ExpectedIntent {
    pub network_passphrase: String,
    pub entries: Vec<ExpectedEntry>,
}

fn exact_keys<'a>(v: &'a Value, keys: &[&str], what: &str) -> Result<&'a Map<String, Value>, String> {
    let m = v.as_object().ok_or(format!("{what} must be a JSON object"))?;
    for k in m.keys() {
        if !keys.contains(&k.as_str()) {
            return Err(format!("{what} has an unknown field"));
        }
    }
    for k in keys {
        if !m.contains_key(*k) {
            return Err(format!("{what} is missing field {k}"));
        }
    }
    Ok(m)
}

fn text<'a>(v: &'a Value, what: &str) -> Result<&'a str, String> {
    v.as_str().ok_or(format!("{what} must be a string"))
}

fn parse_json(src: &str, what: &str) -> Result<Value, String> {
    if src.len() > MAX_JSON_BYTES {
        return Err(format!("{what} is larger than {MAX_JSON_BYTES} bytes"));
    }
    // serde_json's own recursion limit (128) bounds nesting; our schema is far shallower
    serde_json::from_str(src).map_err(|_| format!("{what} is not valid JSON"))
}

fn passphrase_ok(p: &str) -> Result<(), String> {
    if p.is_empty() || p.len() > 256 || p.chars().any(|c| c.is_control()) {
        return Err("the network passphrase must be 1 to 256 printable characters".into());
    }
    Ok(())
}

pub fn parse_deployment(src: &str) -> Result<DeploymentRecord, String> {
    let v = parse_json(src, "the deployment record")?;
    let m = exact_keys(&v, &["version", "network_passphrase", "clearing", "token"], "the deployment record")?;
    if m["version"].as_u64() != Some(DEPLOYMENT_VERSION) {
        return Err("unsupported deployment record version".into());
    }
    let passphrase = text_of(&m["network_passphrase"], "network_passphrase")?;
    passphrase_ok(&passphrase)?;
    let clearing = contract_id(&address_of(text_of(&m["clearing"], "clearing")?.as_str())?).ok_or("clearing must be a contract (C...) address")?;
    let token = contract_id(&address_of(text_of(&m["token"], "token")?.as_str())?).ok_or("token must be a contract (C...) address")?;
    if clearing == token {
        return Err("the clearing and token contracts must be different".into());
    }
    Ok(DeploymentRecord { network_passphrase: passphrase, clearing, token })
}

fn text_of(v: &Value, what: &str) -> Result<String, String> {
    Ok(text(v, what)?.to_string())
}

fn sym(k: &str) -> ScVal {
    ScVal::Symbol(k.try_into().unwrap())
}

fn i128_val(n: i128) -> ScVal {
    ScVal::I128(xdr::Int128Parts { hi: (n >> 64) as i64, lo: n as u64 })
}

fn bytes32_val(hexs: &str) -> Result<ScVal, String> {
    if hexs.len() != 64 || !hexs.bytes().all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c)) {
        return Err("a bytes32 value must be 64 lowercase hex characters".into());
    }
    let b: Vec<u8> = (0..32).map(|i| u8::from_str_radix(&hexs[2 * i..2 * i + 2], 16).unwrap()).collect();
    Ok(ScVal::Bytes(ScBytes(b.try_into().unwrap())))
}

fn amount(s: &str) -> Result<i128, String> {
    let n: i128 = s.parse().map_err(|_| "an amount must be a decimal i128".to_string())?;
    if n.to_string() != s {
        return Err("an amount must be canonical decimal (no sign prefix, no leading zeros)".into());
    }
    Ok(n)
}

fn addr_val(s: &str) -> Result<ScVal, String> {
    Ok(ScVal::Address(address_of(s)?))
}

fn map_val(mut fields: Vec<(&str, ScVal)>) -> ScVal {
    // a `#[contracttype]` struct is an ScMap keyed by field-name symbols in ascending key order
    fields.sort_by(|a, b| a.0.cmp(b.0));
    ScVal::Map(Some(ScMap(fields.into_iter().map(|(k, v)| ScMapEntry { key: sym(k), val: v }).collect::<Vec<_>>().try_into().unwrap())))
}

fn str_field<'a>(m: &'a Map<String, Value>, k: &str) -> Result<&'a str, String> {
    text(&m[k], k)
}

fn parse_arg(v: &Value) -> Result<ScVal, String> {
    let m = exact_keys(v, &["t", "v"], "an argument")?;
    let t = text(&m["t"], "argument type")?;
    let val = &m["v"];
    match t {
        "addr" => addr_val(text(val, "an address argument")?),
        "bytes32" => bytes32_val(text(val, "a bytes32 argument")?),
        "i128" => Ok(i128_val(amount(text(val, "an i128 argument")?)?)),
        "u32" => {
            let n = val.as_u64().ok_or("a u32 argument must be an unsigned integer")?;
            Ok(ScVal::U32(u32::try_from(n).map_err(|_| "a u32 argument is out of range".to_string())?))
        }
        "obligation" => {
            let o = exact_keys(val, &["id", "debtor", "creditor", "amount"], "an obligation argument")?;
            Ok(map_val(vec![
                ("id", bytes32_val(str_field(o, "id")?)?),
                ("debtor", addr_val(str_field(o, "debtor")?)?),
                ("creditor", addr_val(str_field(o, "creditor")?)?),
                ("amount", i128_val(amount(str_field(o, "amount")?)?)),
            ]))
        }
        "instructions" => {
            let a = val.as_array().ok_or("an instructions argument must be an array")?;
            if a.len() > MAX_VEC_ITEMS {
                return Err("too many instructions".into());
            }
            let mut items = Vec::new();
            for i in a {
                let o = exact_keys(i, &["payer", "payee", "amount"], "an instruction")?;
                items.push(map_val(vec![
                    ("payer", addr_val(str_field(o, "payer")?)?),
                    ("payee", addr_val(str_field(o, "payee")?)?),
                    ("amount", i128_val(amount(str_field(o, "amount")?)?)),
                ]));
            }
            Ok(ScVal::Vec(Some(ScVec(items.try_into().map_err(|_| "too many instructions".to_string())?))))
        }
        _ => Err("unsupported argument type".into()),
    }
}

fn parse_tree(v: &Value, depth: usize, nodes: &mut usize, dep: &DeploymentRecord) -> Result<SorobanAuthorizedInvocation, String> {
    if depth >= MAX_TREE_DEPTH {
        return Err(format!("an invocation tree is deeper than {MAX_TREE_DEPTH}"));
    }
    *nodes += 1;
    if *nodes > MAX_TREE_NODES {
        return Err(format!("an invocation tree has more than {MAX_TREE_NODES} nodes"));
    }
    let m = exact_keys(v, &["contract", "fn", "args", "subs"], "an invocation")?;
    let contract = contract_id(&address_of(text(&m["contract"], "contract")?)?).ok_or("an invocation must name a contract (C...) address")?;
    if contract != dep.clearing && contract != dep.token {
        return Err("an invocation names a contract that is not in the pinned deployment record".into());
    }
    let f = text(&m["fn"], "fn")?;
    if f.is_empty() || f.len() > 32 {
        return Err("a function name must be 1 to 32 characters".into());
    }
    let args_v = m["args"].as_array().ok_or("args must be an array")?;
    if args_v.len() > MAX_ARGS {
        return Err("too many arguments".into());
    }
    let args: Vec<ScVal> = args_v.iter().map(parse_arg).collect::<Result<_, _>>()?;
    let subs_v = m["subs"].as_array().ok_or("subs must be an array")?;
    let subs: Vec<SorobanAuthorizedInvocation> = subs_v.iter().map(|s| parse_tree(s, depth + 1, nodes, dep)).collect::<Result<_, _>>()?;
    Ok(SorobanAuthorizedInvocation {
        function: xdr::SorobanAuthorizedFunction::ContractFn(xdr::InvokeContractArgs {
            contract_address: ScAddress::Contract(xdr::ContractId(Hash(contract))),
            function_name: f.try_into().map_err(|_| "a function name is not a valid symbol".to_string())?,
            args: args.try_into().map_err(|_| "too many arguments".to_string())?,
        }),
        sub_invocations: subs.try_into().map_err(|_| "too many sub-invocations".to_string())?,
    })
}

/// (contract id, function name, arguments, sub-invocations) of a contract-function invocation
type InvocationParts = ([u8; 32], String, Vec<ScVal>, Vec<SorobanAuthorizedInvocation>);

fn parts(inv: &SorobanAuthorizedInvocation) -> Result<InvocationParts, String> {
    let xdr::SorobanAuthorizedFunction::ContractFn(c) = &inv.function else {
        return Err("only contract-function invocations are supported".into());
    };
    let id = contract_id(&c.contract_address).ok_or("an invocation must name a contract address")?;
    Ok((id, c.function_name.to_utf8_string_lossy(), c.args.to_vec(), inv.sub_invocations.to_vec()))
}

fn tree_metrics(inv: &SorobanAuthorizedInvocation, depth: usize, nodes: &mut usize) -> Result<(), String> {
    if depth >= MAX_TREE_DEPTH {
        return Err(format!("an invocation tree is deeper than {MAX_TREE_DEPTH}"));
    }
    *nodes += 1;
    if *nodes > MAX_TREE_NODES {
        return Err(format!("an invocation tree has more than {MAX_TREE_NODES} nodes"));
    }
    for s in inv.sub_invocations.iter() {
        tree_metrics(s, depth + 1, nodes)?;
    }
    Ok(())
}

fn as_addr_key(v: &ScVal) -> Option<&ScAddress> {
    match v {
        ScVal::Address(a) => Some(a),
        _ => None,
    }
}

fn as_i128(v: &ScVal) -> Option<i128> {
    match v {
        ScVal::I128(p) => Some(((p.hi as i128) << 64) | p.lo as i128),
        _ => None,
    }
}

/// The complete semantic check of one expected entry against the pinned record. This is what makes the intent a strict, independent statement of what
/// each contract call may authorize: allowed functions only, exact argument shapes, the signer in the role the contract assigns it, and for settlement the
/// exact transfer structure the contract produces.
fn validate_semantics(signer: &[u8; 32], tree: &SorobanAuthorizedInvocation, dep: &DeploymentRecord) -> Result<(), String> {
    let (contract, f, args, subs) = parts(tree)?;
    let me = ScAddress::Account(xdr::AccountId(xdr::PublicKey::PublicKeyTypeEd25519(xdr::Uint256(*signer))));
    let is_me = |v: &ScVal| as_addr_key(v) == Some(&me);
    let is_bytes32 = |v: &ScVal| matches!(v, ScVal::Bytes(b) if b.len() == 32);
    let positive = |v: &ScVal| as_i128(v).is_some_and(|n| n > 0);
    let no_subs = || if subs.is_empty() { Ok(()) } else { Err(format!("{f} must not carry sub-invocations")) };
    let shape = |ok: bool| if ok { Ok(()) } else { Err(format!("the arguments of {f} do not have the expected shape")) };
    if contract == dep.clearing {
        match f.as_str() {
            "create_session" => {
                no_subs()?;
                shape(
                    args.len() == 5
                        && is_me(&args[0])
                        && is_bytes32(&args[1])
                        && as_addr_key(&args[2]).and_then(contract_id) == Some(dep.token)
                        && matches!(args[3], ScVal::U32(_))
                        && matches!(args[4], ScVal::U32(_)),
                )
            }
            "join_session" => {
                no_subs()?;
                shape(args.len() == 2 && is_bytes32(&args[0]) && as_addr_key(&args[1]).is_some())
            }
            "submit_obligation" => {
                no_subs()?;
                shape(args.len() == 2 && is_bytes32(&args[0]) && obligation_ok(&args[1], &me))
            }
            "finalize_obligations" => {
                no_subs()?;
                shape(args.len() == 2 && is_bytes32(&args[0]) && is_me(&args[1]))
            }
            "propose_settlement" => {
                no_subs()?;
                shape(args.len() == 3 && is_bytes32(&args[0]) && is_me(&args[1]) && matches!(&args[2], ScVal::Vec(Some(_))))
            }
            "approve_settlement" => {
                no_subs()?;
                shape(args.len() == 3 && is_bytes32(&args[0]) && is_me(&args[1]) && is_bytes32(&args[2]))
            }
            "settle" => {
                shape(args.len() == 3 && is_bytes32(&args[0]) && is_bytes32(&args[1]) && positive(&args[2]))?;
                settle_semantics(&me, &args, &subs, dep)
            }
            _ => Err(format!("{f} is not a supported signing call")),
        }
    } else if contract == dep.token {
        match f.as_str() {
            "mint" => {
                no_subs()?;
                shape(args.len() == 2 && as_addr_key(&args[0]).is_some() && positive(&args[1]))
            }
            _ => Err(format!("{f} is not a supported root call on the token contract")),
        }
    } else {
        Err("the root invocation is not on a pinned contract".into())
    }
}

fn obligation_ok(v: &ScVal, me: &ScAddress) -> bool {
    let ScVal::Map(Some(m)) = v else { return false };
    if m.len() != 4 {
        return false;
    }
    let get = |k: &str| m.iter().find(|e| e.key == sym(k)).map(|e| &e.val);
    let (Some(id), Some(d), Some(c), Some(a)) = (get("id"), get("debtor"), get("creditor"), get("amount")) else { return false };
    matches!(id, ScVal::Bytes(b) if b.len() == 32) && as_addr_key(d) == Some(me) && as_addr_key(c).is_some_and(|c| c != me) && as_i128(a).is_some_and(|n| n > 0)
}

fn settle_semantics(me: &ScAddress, args: &[ScVal], subs: &[SorobanAuthorizedInvocation], dep: &DeploymentRecord) -> Result<(), String> {
    let total = as_i128(&args[2]).ok_or("the total must be an i128")?;
    if subs.is_empty() {
        return Err("a settlement authorization must carry at least one transfer".into());
    }
    let mut sum: i128 = 0;
    let mut last: Option<Vec<u8>> = None;
    for s in subs {
        let (c, f, a, inner) = parts(s)?;
        if c != dep.token || f != "transfer" || !inner.is_empty() || a.len() != 3 {
            return Err("a settlement may only contain token.transfer sub-invocations on the pinned token".into());
        }
        if as_addr_key(&a[0]) != Some(me) {
            return Err("a transfer must pay from the signer".into());
        }
        let to = as_addr_key(&a[1]).ok_or("a transfer destination must be an address")?;
        if to == me {
            return Err("a transfer must not pay the signer itself".into());
        }
        let amt = as_i128(&a[2]).filter(|n| *n > 0).ok_or("a transfer amount must be positive")?;
        sum = sum.checked_add(amt).ok_or("the transfer total overflows i128")?;
        let key = to.to_xdr(Limits::none()).map_err(|_| "address encoding failed".to_string())?;
        if let Some(prev) = &last {
            if &key <= prev {
                return Err("transfers must go to distinct payees in strictly ascending order (the contract's instruction order)".into());
            }
        }
        last = Some(key);
    }
    if sum != total {
        return Err("the declared total is not the sum of the transfers".into());
    }
    Ok(())
}

/// Parse and fully validate an intent against the pinned deployment record. Rejects unknown versions, unknown fields, unsupported types, contracts
/// outside the record, a different network passphrase, duplicate expected entries and any semantically inconsistent entry.
pub fn parse_intent(src: &str, dep: &DeploymentRecord) -> Result<ExpectedIntent, String> {
    let v = parse_json(src, "the intent")?;
    let m = exact_keys(&v, &["version", "network_passphrase", "entries"], "the intent")?;
    if m["version"].as_u64() != Some(INTENT_VERSION) {
        return Err("unsupported intent version".into());
    }
    let passphrase = text_of(&m["network_passphrase"], "network_passphrase")?;
    passphrase_ok(&passphrase)?;
    if passphrase != dep.network_passphrase {
        return Err("the intent's network passphrase differs from the pinned deployment record".into());
    }
    let entries_v = m["entries"].as_array().ok_or("entries must be an array")?;
    if entries_v.is_empty() || entries_v.len() > MAX_AUTH_ENTRIES {
        return Err(format!("an intent needs 1 to {MAX_AUTH_ENTRIES} entries"));
    }
    let mut entries: Vec<ExpectedEntry> = Vec::new();
    for e in entries_v {
        let em = exact_keys(e, &["signer", "tree"], "an intent entry")?;
        let signer = account_key(&address_of(text(&em["signer"], "signer")?)?).ok_or("a signer must be an account (G...) address")?;
        let mut nodes = 0;
        let tree = parse_tree(&em["tree"], 0, &mut nodes, dep)?;
        validate_semantics(&signer, &tree, dep)?;
        if entries.iter().any(|x| x.signer == signer && x.tree == tree) {
            return Err("duplicate expected entry".into());
        }
        entries.push(ExpectedEntry { signer, tree });
    }
    Ok(ExpectedIntent { network_passphrase: passphrase, entries })
}

// ------------------------------------------------------------------------------------------------------------------------------------------
// signing
// ------------------------------------------------------------------------------------------------------------------------------------------

#[derive(Debug, Default, PartialEq, Eq)]
pub struct Report {
    /// (entry index, first 4 bytes of the account key in hex)
    pub signed: Vec<(usize, String)>,
    /// expected co-signer entries that matched their intent and were left exactly as they were (unsigned or signed by someone else)
    pub preserved: Vec<(usize, String)>,
}

/// The 32 bytes that are signed for one entry.
pub fn payload(network_id: [u8; 32], c: &SorobanAddressCredentials, invocation: &SorobanAuthorizedInvocation) -> Result<[u8; 32], String> {
    let preimage = HashIdPreimage::SorobanAuthorization(HashIdPreimageSorobanAuthorization {
        network_id: Hash(network_id),
        nonce: c.nonce,
        signature_expiration_ledger: c.signature_expiration_ledger,
        invocation: invocation.clone(),
    });
    let bytes = preimage.to_xdr(Limits::none()).map_err(|e| format!("preimage encoding failed: {e}"))?;
    Ok(Sha256::digest(&bytes).into())
}

fn signature_value(key: &SigningKey, sig: [u8; 64]) -> ScVal {
    let entry = |k: &str, v: Vec<u8>| ScMapEntry { key: ScVal::Symbol(k.try_into().unwrap()), val: ScVal::Bytes(ScBytes(v.try_into().unwrap())) };
    ScVal::Vec(Some(ScVec(
        vec![ScVal::Map(Some(ScMap(
            vec![entry("public_key", key.verifying_key().to_bytes().to_vec()), entry("signature", sig.to_vec())].try_into().unwrap(),
        )))]
        .try_into()
        .unwrap(),
    )))
}

/// Sign one address-credential entry in place. Private: the only production path is `sign_envelope`, which has matched the entry to an expected intent
/// and checked the expiry policy before calling this.
fn sign_entry(entry: &mut SorobanAuthorizationEntry, network_id: [u8; 32], expiration_ledger: u32, key: &SigningKey) -> Result<(), String> {
    if expiration_ledger == 0 {
        return Err("expiration ledger must be explicit and non-zero".into());
    }
    let tree = entry.root_invocation.clone();
    let SorobanCredentials::Address(c) = &mut entry.credentials else {
        return Err("entry does not carry address credentials".into());
    };
    if !matches!(c.signature, ScVal::Void) {
        return Err("entry already carries a signature; refusing to rewrite it".into());
    }
    c.signature_expiration_ledger = expiration_ledger;
    let p = payload(network_id, c, &tree)?;
    c.signature = signature_value(key, key.sign(&p).to_bytes());
    Ok(())
}

/// TEST-ONLY affordance (it does not exist outside test builds): sign an entry with any key and no intent check, so negative tests can produce a
/// signature that the host must reject.
#[cfg(test)]
pub fn sign_entry_unchecked_for_tests(entry: &mut SorobanAuthorizationEntry, network_id: [u8; 32], expiration_ledger: u32, key: &SigningKey) -> Result<(), String> {
    sign_entry(entry, network_id, expiration_ledger, key)
}

/// Sign every entry that belongs to one of `keys`, but only if the WHOLE envelope matches `intent`. All checks happen first; on any error nothing is
/// changed. `current_ledger` is caller-supplied (trust boundary, see the module documentation).
pub fn sign_envelope(env: &mut TransactionEnvelope, intent: &ExpectedIntent, keys: &[SigningKey], current_ledger: Option<u32>, expiration_ledger: u32) -> Result<Report, String> {
    let expiration_ledger = check_expiry(current_ledger, expiration_ledger)?;
    if keys.is_empty() {
        return Err("no signing key was supplied".into());
    }
    let pubs: Vec<[u8; 32]> = keys.iter().map(|k| k.verifying_key().to_bytes()).collect();
    for (i, p) in pubs.iter().enumerate() {
        if pubs[..i].contains(p) {
            return Err("the same signing key was supplied twice".into());
        }
    }
    let nid = network_id(&intent.network_passphrase);

    let mut work = env.clone();
    let TransactionEnvelope::Tx(v1) = &mut work else {
        return Err("only a plain v1 transaction envelope is supported".into());
    };
    if !v1.signatures.is_empty() {
        return Err("the envelope already carries signatures; sign authorization entries before the envelope".into());
    }
    let mut invoke = None;
    for (i, op) in v1.tx.operations.iter().enumerate() {
        if matches!(op.body, OperationBody::InvokeHostFunction(_)) {
            if invoke.is_some() {
                return Err("more than one InvokeHostFunction operation".into());
            }
            invoke = Some(i);
        }
    }
    let i = invoke.ok_or("no InvokeHostFunction operation")?;
    let mut ops = v1.tx.operations.to_vec();
    let OperationBody::InvokeHostFunction(ihf) = &mut ops[i].body else { unreachable!() };
    let mut entries = ihf.auth.to_vec();
    if entries.len() > MAX_AUTH_ENTRIES {
        return Err(format!("more than {MAX_AUTH_ENTRIES} authorization entries"));
    }

    // 1. credential kinds and tree limits, for every entry, before anything else
    for (n, e) in entries.iter().enumerate() {
        match &e.credentials {
            SorobanCredentials::Address(_) => {}
            SorobanCredentials::SourceAccount => return Err(format!("entry {n} is a source-account credential, which the intent does not allow")),
            _ => return Err(format!("entry {n} has an unsupported credential kind (only legacy Address credentials are supported)")),
        }
        let mut nodes = 0;
        tree_metrics(&e.root_invocation, 0, &mut nodes).map_err(|m| format!("entry {n}: {m}"))?;
    }

    // 2. every envelope entry must be exactly one expected entry (signer AND tree), and every expected entry must appear exactly once
    let mut used = vec![false; intent.entries.len()];
    let mut owner: Vec<usize> = Vec::new(); // expected index per envelope entry
    for (n, e) in entries.iter().enumerate() {
        let SorobanCredentials::Address(c) = &e.credentials else { unreachable!() };
        let key = account_key(&c.address).ok_or(format!("entry {n} is authorized by a contract address, which is not supported"))?;
        if !intent.entries.iter().any(|x| x.signer == key) {
            return Err(format!("entry {n} belongs to {} which the intent does not expect (unexpected entry)", short(&key)));
        }
        let j = intent
            .entries
            .iter()
            .position(|x| x.signer == key && x.tree == e.root_invocation)
            .ok_or(format!("entry {n} for {} does not match its expected invocation tree", short(&key)))?;
        if used[j] {
            return Err(format!("entry {n} duplicates an entry that was already matched"));
        }
        used[j] = true;
        owner.push(j);
    }
    if let Some(j) = used.iter().position(|u| !u) {
        return Err(format!("the envelope has no entry for the expected signer {}", short(&intent.entries[j].signer)));
    }

    // 3. every requested key must have at least one entry, and its entries must be unsigned
    for p in &pubs {
        let mine: Vec<usize> = (0..entries.len()).filter(|n| intent.entries[owner[*n]].signer == *p).collect();
        if mine.is_empty() {
            return Err(format!("the key {} has no expected entry", short(p)));
        }
        for n in mine {
            let SorobanCredentials::Address(c) = &entries[n].credentials else { unreachable!() };
            if !matches!(c.signature, ScVal::Void) {
                return Err(format!("entry {n} already carries a signature; refusing to rewrite it"));
            }
        }
    }

    // 4. only now: sign the working copy
    let mut report = Report::default();
    for (n, e) in entries.iter_mut().enumerate() {
        let who = intent.entries[owner[n]].signer;
        match pubs.iter().position(|p| *p == who) {
            Some(k) => {
                sign_entry(e, nid, expiration_ledger, &keys[k]).map_err(|m| format!("entry {n}: {m}"))?;
                report.signed.push((n, short(&who)));
            }
            None => report.preserved.push((n, short(&who))),
        }
    }
    ihf.auth = entries.try_into().map_err(|_| "too many authorization entries".to_string())?;
    v1.tx.operations = ops.try_into().map_err(|_| "operation list rebuild failed".to_string())?;
    *env = work;
    Ok(report)
}

pub fn read_envelope(b64: &str) -> Result<TransactionEnvelope, String> {
    use xdr::ReadXdr;
    let b64 = b64.trim();
    if b64.len() > MAX_ENVELOPE_BYTES / 3 * 4 + 8 {
        return Err(format!("the envelope is larger than {MAX_ENVELOPE_BYTES} bytes"));
    }
    TransactionEnvelope::from_xdr_base64(b64, Limits { depth: XDR_DEPTH_LIMIT, len: MAX_ENVELOPE_BYTES }).map_err(|e| format!("envelope decoding failed: {e}"))
}

pub fn write_envelope(env: &TransactionEnvelope) -> Result<String, String> {
    env.to_xdr_base64(Limits::none()).map_err(|e| format!("envelope encoding failed: {e}"))
}
