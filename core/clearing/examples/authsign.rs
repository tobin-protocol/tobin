//! Local-only authorization-entry signer for disposable TEST keys (Milestone 8, Stage B). Not a wallet; not deployable. See signer/mod.rs.
//!   authsign --deployment DEPLOYMENT.json --intent INTENT.json --current-ledger N --expiration-ledger N --key KEYFILE [--key KEYFILE]...  < unsigned.b64  > signed.b64
//! Reads a base64 transaction envelope (as returned by `stellar tx simulate`) on stdin and an expected intent from a SEPARATE file that the TypeScript SDK
//! produced from independently validated state (never from the envelope). It signs the entries of the supplied keys only if the whole envelope matches
//! the intent, and writes the signed envelope on stdout and a report (no secrets) on stderr. There is no mode without an intent.
//! Policy: current < expiration <= current + 10; --current-ledger is caller-supplied and must come from a source you trust (see signer/mod.rs).
#[path = "../signer/mod.rs"]
mod signer;
use signer::*;
use std::io::{Read, Write};

fn fail(m: &str) -> ! {
    eprintln!("authsign: {m}");
    std::process::exit(2);
}

fn read_capped(path: &str, what: &str) -> String {
    let meta = std::fs::metadata(path).unwrap_or_else(|_| fail(&format!("cannot read the {what}")));
    if meta.len() > MAX_JSON_BYTES as u64 {
        fail(&format!("the {what} is too large"));
    }
    std::fs::read_to_string(path).unwrap_or_else(|_| fail(&format!("cannot read the {what}")))
}

fn key_from(path: &str) -> ed25519_dalek::SigningKey {
    let meta = std::fs::metadata(path).unwrap_or_else(|_| fail("cannot read a key file"));
    if meta.len() > 1024 {
        fail("a key file is too large");
    }
    let s = std::fs::read_to_string(path).unwrap_or_else(|_| fail("cannot read a key file"));
    parse_secret(&s).unwrap_or_else(|e| fail(&format!("bad key file: {e}")))
}

fn main() {
    let (mut deployment, mut intent, mut expiration, mut current) = (None, None, None, None);
    let mut keys = Vec::new();
    let mut a = std::env::args().skip(1);
    while let Some(f) = a.next() {
        let mut v = || a.next().unwrap_or_else(|| fail("missing value"));
        match f.as_str() {
            "--deployment" => deployment = Some(v()),
            "--intent" => intent = Some(v()),
            "--expiration-ledger" => {
                expiration = Some(
                    v().parse::<u32>()
                        .unwrap_or_else(|_| fail("bad expiration ledger")),
                )
            }
            "--current-ledger" => {
                current = Some(
                    v().parse::<u32>()
                        .unwrap_or_else(|_| fail("bad current ledger")),
                )
            }
            "--key" => keys.push(key_from(&v())),
            _ => fail("unknown argument"),
        }
    }
    let dep = parse_deployment(&read_capped(
        &deployment.unwrap_or_else(|| fail("--deployment is required")),
        "deployment record",
    ))
    .unwrap_or_else(|e| fail(&e));
    let intent = parse_intent(
        &read_capped(
            &intent
                .unwrap_or_else(|| fail("--intent is required (there is no blind-signing mode)")),
            "intent",
        ),
        &dep,
    )
    .unwrap_or_else(|e| fail(&e));
    let expiration = expiration.unwrap_or_else(|| fail("--expiration-ledger is required"));
    let mut input = String::new();
    std::io::stdin()
        .take(MAX_ENVELOPE_BYTES as u64 * 2)
        .read_to_string(&mut input)
        .unwrap_or_else(|_| fail("cannot read stdin"));
    let mut env = read_envelope(&input).unwrap_or_else(|e| fail(&e));
    let report =
        sign_envelope(&mut env, &intent, &keys, current, expiration).unwrap_or_else(|e| fail(&e));
    eprintln!(
        "signed entries (index, account key prefix): {:?}",
        report.signed
    );
    eprintln!(
        "expected co-signer entries preserved unchanged: {:?}",
        report.preserved
    );
    let out = write_envelope(&env).unwrap_or_else(|e| fail(&e));
    std::io::stdout().write_all(out.as_bytes()).unwrap();
}
