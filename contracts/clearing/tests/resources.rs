//! Local resource measurements from the Soroban test host (`env.cost_estimate().resources()`), printed per operation for a worst case at
//! the PROVISIONAL targets: 4 participants, 16 obligations, and the largest plan the validation rules allow with 4 participants (4
//! instructions: 2 debtors x 2 creditors; the 16-instruction target is not reachable with 4 participants under the rules of CD 6.2).
//! These are host-test ESTIMATES, not network measurements: no fees, no transaction size, no network limits. Run with
//! `--nocapture`; set TOBIN_CLEARING_WASM / TOBIN_TOKEN_WASM to measure the compiled Wasm (the numbers that matter) instead of native code.
#![cfg(test)]
mod support;
use support::*;

fn show(label: &str, w: &World) {
    let r = w.env.cost_estimate().resources();
    println!(
        "MEASURE {label:<34} cpu_instructions={:>9} mem_bytes={:>8} mem_read_entries={:>2} disk_read_entries={} write_entries={} write_bytes={:>5} events_bytes={}",
        r.instructions, r.mem_bytes, r.memory_read_entries, r.disk_read_entries, r.write_entries, r.write_bytes, r.contract_events_size_bytes
    );
}

#[test]
fn measure_the_worst_case_session_at_the_provisional_targets() {
    let backend = if std::env::var("TOBIN_CLEARING_WASM").is_ok() {
        "compiled Wasm"
    } else {
        "native code"
    };
    println!("MEASURE backend: {backend}");
    let w = world();
    let s = sid(&w, 1);
    must(create(&w, &w.a, &s, 4, 16));
    show("create_session", &w);
    must(join(&w, &s, &w.b, &w.a));
    must(join(&w, &s, &w.c, &w.a));
    show("join_session (3rd participant)", &w);
    must(join(&w, &s, &w.d, &w.a));
    show("join_session (4th participant)", &w);
    // 16 obligations: A and B each owe C and D, four obligations per pair
    let pairs = [(&w.a, &w.c), (&w.a, &w.d), (&w.b, &w.c), (&w.b, &w.d)];
    let mut id = 0u8;
    for (d, c) in pairs {
        for _ in 0..4 {
            id += 1;
            must(submit(&w, &s, &ob(&w, id, d, c, 3)));
            if id == 1 {
                show("submit_obligation (1st)", &w);
            }
        }
    }
    show("submit_obligation (16th)", &w);
    assert_eq!(clearing(&w).get_obligations(&s).len(), 16);
    must(finalize(&w, &s, &w.d));
    show("finalize_obligations (16 obligations)", &w);
    let p1 = plan(
        &w,
        &[
            (&w.a, &w.c, 12),
            (&w.a, &w.d, 12),
            (&w.b, &w.c, 12),
            (&w.b, &w.d, 12),
        ],
    );
    let d1 = propose_digest(&w, &s, &w.a, &p1);
    show("propose_settlement (first, 4 instr.)", &w);
    let p2 = plan(&w, &[(&w.a, &w.c, 24), (&w.b, &w.d, 24)]);
    let d2 = propose_digest(&w, &s, &w.b, &p2);
    show("propose_settlement (replacement)", &w);
    assert!(d1 != d2);
    let p3 = plan(
        &w,
        &[
            (&w.a, &w.c, 12),
            (&w.a, &w.d, 12),
            (&w.b, &w.c, 12),
            (&w.b, &w.d, 12),
        ],
    );
    let d3 = propose_digest(&w, &s, &w.c, &p3);
    assert!(
        d3 != d1,
        "the same plan at revision 3 has a different digest (EQ-05)"
    );
    for who in [&w.a, &w.b, &w.c] {
        must(approve(&w, &s, who, &d3));
    }
    show("approve_settlement (3rd of 4)", &w);
    assert!(approve_bool(&w, &s, &w.d, &d3));
    show("approve_settlement (4th, completing)", &w);
    mint(&w, &w.a, 24);
    mint(&w, &w.b, 24);
    must(settle(&w, &s, &d3, &p3));
    show("settle (4 transfers, 2 debtors)", &w);
    assert_eq!(
        (bal(&w, &w.a), bal(&w, &w.b), bal(&w, &w.c), bal(&w, &w.d)),
        (0, 0, 24, 24)
    );
}
