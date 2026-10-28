//! Property test of the contract-side validation (CD 6.2): random sessions, random valid plans and single-field mutations of them, with the
//! contract's accept/reject decision compared with an independent oracle written here in plain std Rust from the rules alone.
//! A seeded pseudo-random generator keeps every run identical. This is a same-author oracle, not an independent third-party implementation.
#![cfg(test)]
mod support;
use support::*;
use tobin_clearing_v1::Instruction;

struct Rng(u64);
impl Rng {
    fn next(&mut self) -> u64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        self.0
    }
    fn below(&mut self, n: u64) -> u64 {
        self.next() % n
    }
}

type Plan = std::vec::Vec<(usize, usize, i128)>; // (payer index, payee index, amount) into the participant list

/// The oracle: is this plan valid for these nets under the rules of CD 6.2? `keys[i]` is the XDR byte key of participant i.
fn oracle(nets: &[i128], keys: &[std::vec::Vec<u8>], plan: &Plan) -> bool {
    if plan.len() > 16 {
        return false;
    }
    let n = nets.len();
    let (mut debit, mut credit) = (std::vec![0i128; n], std::vec![0i128; n]);
    let mut prev: Option<(&std::vec::Vec<u8>, &std::vec::Vec<u8>)> = None;
    for &(p, q, amt) in plan {
        if p >= n || q >= n || p == q || amt <= 0 {
            return false;
        }
        let key = (&keys[p], &keys[q]);
        if let Some(pk) = prev {
            if !(pk.0 < key.0 || (pk.0 == key.0 && pk.1 < key.1)) {
                return false;
            }
        }
        prev = Some(key);
        debit[p] += amt;
        credit[q] += amt;
    }
    (0..n).all(|i| debit[i] == nets[i].max(0) && credit[i] == (-nets[i]).max(0))
}

/// A random valid plan: pair debtors and creditors in random order and random chunk sizes, merging repeated pairs, then sort by key.
fn random_valid_plan(rng: &mut Rng, nets: &[i128], keys: &[std::vec::Vec<u8>]) -> Plan {
    let mut owe: std::vec::Vec<(usize, i128)> = nets.iter().enumerate().filter(|(_, &v)| v > 0).map(|(i, &v)| (i, v)).collect();
    let mut due: std::vec::Vec<(usize, i128)> = nets.iter().enumerate().filter(|(_, &v)| v < 0).map(|(i, &v)| (i, -v)).collect();
    let mut merged: std::collections::BTreeMap<(usize, usize), i128> = Default::default();
    while !owe.is_empty() && !due.is_empty() {
        let (i, j) = (rng.below(owe.len() as u64) as usize, rng.below(due.len() as u64) as usize);
        let amt = 1 + rng.below(owe[i].1.min(due[j].1) as u64) as i128;
        *merged.entry((owe[i].0, due[j].0)).or_default() += amt;
        owe[i].1 -= amt;
        due[j].1 -= amt;
        if owe[i].1 == 0 {
            owe.remove(i);
        }
        if due[j].1 == 0 {
            due.remove(j);
        }
    }
    let mut plan: Plan = merged.into_iter().map(|((p, q), a)| (p, q, a)).collect();
    plan.sort_by(|x, y| (&keys[x.0], &keys[x.1]).cmp(&(&keys[y.0], &keys[y.1])));
    plan
}

fn mutate(rng: &mut Rng, plan: &Plan, n: usize) -> Plan {
    let mut p = plan.clone();
    match rng.below(8) {
        0 if !p.is_empty() => {
            let i = rng.below(p.len() as u64) as usize;
            p[i].2 += if rng.below(2) == 0 { 1 } else { -1 };
        }
        1 if !p.is_empty() => {
            p.remove(rng.below(p.len() as u64) as usize);
        }
        2 if !p.is_empty() => {
            let i = rng.below(p.len() as u64) as usize;
            p.insert(i, p[i]);
        }
        3 if p.len() >= 2 => {
            let i = rng.below(p.len() as u64 - 1) as usize;
            p.swap(i, i + 1);
        }
        4 if !p.is_empty() => {
            let i = rng.below(p.len() as u64) as usize;
            p[i].1 = rng.below(n as u64) as usize;
        }
        5 => p.push((rng.below(n as u64) as usize, rng.below(n as u64) as usize, 1 + rng.below(5) as i128)),
        6 => {
            for x in p.iter_mut() {
                std::mem::swap(&mut x.0, &mut x.1);
            }
        }
        _ if !p.is_empty() => {
            let i = rng.below(p.len() as u64) as usize;
            p[i].0 = rng.below(n as u64) as usize;
        }
        _ => {}
    }
    p
}

#[test]
fn the_contracts_validation_agrees_with_an_independent_oracle_on_random_plans() {
    let w = world();
    let accts = [&w.a, &w.b, &w.c, &w.d];
    let mut rng = Rng(0x9E3779B97F4A7C15);
    let (mut accepted, mut rejected, mut zero_sessions, mut multi_plan_sessions) = (0u32, 0u32, 0u32, 0u32);
    for case in 0..120u32 {
        let n = 2 + rng.below(3) as usize; // 2..=4 participants
        let parts = &accts[..n];
        let s = sid(&w, (case % 250) as u8 + 1);
        must(create(&w, &w.a, &s, 4, 16));
        for p in &parts[1..] {
            must(join(&w, &s, p, &w.a));
        }
        let mut nets = std::vec![0i128; n];
        let m = 1 + rng.below(6);
        for k in 0..m {
            let d = rng.below(n as u64) as usize;
            let mut c = rng.below(n as u64) as usize;
            if c == d {
                c = (c + 1) % n;
            }
            let amt = 1 + rng.below(40) as i128;
            nets[d] += amt;
            nets[c] -= amt;
            must(submit(&w, &s, &ob(&w, k as u8 + 1, parts[d], parts[c], amt)));
        }
        must(finalize(&w, &s, parts[0])); // all-zero nets are allowed
        let keys: std::vec::Vec<std::vec::Vec<u8>> = parts.iter().map(|p| xkey(&w.env, &p.addr)).collect();
        if nets.iter().all(|&x| x == 0) {
            zero_sessions += 1;
        }
        let mut digests = std::collections::BTreeSet::new();
        let valid = random_valid_plan(&mut rng, &nets, &keys);
        assert!(oracle(&nets, &keys, &valid), "generator produced an invalid plan");
        let mut candidates = std::vec![valid.clone()];
        for _ in 0..8 {
            let base = if rng.below(3) == 0 { random_valid_plan(&mut rng, &nets, &keys) } else { valid.clone() };
            candidates.push(mutate(&mut rng, &base, n));
        }
        for cand in candidates {
            let list = to_instructions(&w, &accts, &cand);
            let expect = oracle(&nets, &keys, &cand);
            let got = propose(&w, &s, parts[0], &list);
            let ok = matches!(got, Out::Ok);
            assert_eq!(ok, expect, "case {case}: nets {nets:?} plan {cand:?} -> {got:?}");
            if expect {
                accepted += 1;
                digests.insert(std::format!("{cand:?}"));
            } else {
                rejected += 1;
            }
        }
        if digests.len() > 1 {
            multi_plan_sessions += 1;
        }
    }
    println!("property test: accepted {accepted}, rejected {rejected}, all-zero sessions {zero_sessions}, sessions that accepted several different valid plans {multi_plan_sessions}");
    assert!(accepted > 100 && rejected > 100);
    assert!(multi_plan_sessions > 0, "the generator must exercise sessions with several valid plans");
}

fn to_instructions(w: &World, accts: &[&Acct; 4], plan: &Plan) -> soroban_sdk::Vec<Instruction> {
    let mut v = soroban_sdk::Vec::new(&w.env);
    for &(p, q, amt) in plan {
        // an index beyond the session's participants refers to an account that exists but never joined
        v.push_back(Instruction { payer: accts[p.min(3)].addr.clone(), payee: accts[q.min(3)].addr.clone(), amount: amt });
    }
    v
}
