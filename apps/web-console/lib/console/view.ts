// Pure rendering: a Console model in, an HTML string out. No DOM access, so every honesty rule below is testable in Node.
//
// Wording rules enforced by tests (console-view.test.ts):
//  * a permanent banner says the world is a LOCAL SANDBOX with no network, no wallet and no signatures;
//  * a session is called "settled" only when the CONTRACT reports state Settled, and then only "in the local sandbox";
//  * an all-zero session never shows transfer activity;
//  * a stalled session is never described as completing by itself;
//  * authorizations are labelled simulated local grants.
import { EngineError, parsePositiveAmount } from 'tobin-mvp1-sdk/amount';
import type { Instruction } from 'tobin-mvp1-sdk/engine';
import type { Model, Persona } from './controller.ts';

export const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function formatPlan(list: readonly Instruction[], nameOf: (a: string) => string): string {
  return list.map((i) => `${nameOf(i.payer)} -> ${nameOf(i.payee)} : ${i.amount}`).join('\n');
}

/** Parse "Alice -> Bob : 20" lines into instructions (account names from the personas). Blank lines are ignored. */
export function parsePlan(text: string, personas: readonly Persona[]): Instruction[] {
  const byName = new Map(personas.map((p) => [p.name.toLowerCase(), p.address] as const));
  const out: Instruction[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const m = /^(\S+)\s*->\s*(\S+)\s*:\s*(\d+)$/.exec(line);
    if (!m) throw new EngineError('INVALID_AMOUNT', `cannot read "${line}": write one transfer per line as  Payer -> Payee : amount`);
    const payer = byName.get((m[1] as string).toLowerCase());
    const payee = byName.get((m[2] as string).toLowerCase());
    if (!payer || !payee) throw new EngineError('UNKNOWN_PARTY', `unknown account in "${line}"`);
    out.push({ payer, payee, amount: parsePositiveAmount(m[3]) });
  }
  return out;
}

const short = (a: string): string => `${a.slice(0, 5)}...${a.slice(-4)}`;
const sig = (hex: string): string => `${hex.slice(0, 10)}...${hex.slice(-6)}`;

export function renderApp(m: Model): string {
  const nameOf = (a: string): string => m.personas.find((p) => p.address === a)?.name ?? short(a);
  const st = m.status;
  const out: string[] = [];

  out.push('<div class="badge" role="status">LOCAL SANDBOX - no network, no wallet</div>');
  out.push(`<div class="banner" role="note"><strong>Read this first.</strong> ${esc(m.ranOn)}. Nothing here is signed, submitted or confirmed on any network or ledger. Authorizations are simulated local grants (no signature); the real contract still checks each one against the exact call. The sandbox lives only in the memory of the local server process: it is not saved anywhere, it disappears when that process stops, and this page does not remember which session you had open after a reload.</div>`);

  // accounts and balances
  out.push('<section><h2>Accounts and test tokens</h2><table><thead><tr><th>Account</th><th>Address</th>');
  for (const t of m.tokens) out.push(`<th>${esc(t.name)} balance</th>`);
  out.push('</tr></thead><tbody>');
  for (const p of m.personas) {
    out.push(`<tr><td>${esc(p.name)}</td><td title="${esc(p.address)}">${esc(short(p.address))}</td>`);
    for (const t of m.tokens) out.push(`<td>${esc(m.balances[t.address]?.[p.name] ?? '-')}</td>`);
    out.push('</tr>');
  }
  out.push('</tbody></table>');
  out.push(`<form data-action="mint"><label>Mint to <select name="to">${m.personas.map((p) => `<option>${esc(p.name)}</option>`).join('')}</select></label> <label>token <select name="token">${m.tokens.map((t) => `<option>${esc(t.name)}</option>`).join('')}</select></label> <label>amount <input name="amount" value="100" size="8"></label> <button>Prepare mint</button> <small>Test tokens only; each token has a hard supply cap (${m.tokens.map((t) => `${esc(t.name)}: ${esc(t.cap)}`).join(', ')}).</small></form></section>`);

  // session
  out.push('<section><h2>Session</h2>');
  out.push(`<form data-action="select"><label>Session label <input name="label" value="${esc(m.sessionLabel ?? '')}" placeholder="e.g. demo-1"></label> <button>Open or select</button> <small>The session id is a hash of the label.</small></form>`);
  if (m.sessionLabel && !st) {
    out.push(`<p>No session "${esc(m.sessionLabel)}" exists yet in the sandbox.</p>`);
    out.push(`<form data-action="create"><label>Creator <select name="creator">${personaOptions(m)}</select></label> <label>Token <select name="token">${m.tokens.map((t) => `<option>${esc(t.name)}</option>`).join('')}</select></label> <label>max participants <input name="maxParticipants" value="4" size="2"></label> <label>max obligations <input name="maxObligations" value="16" size="2"></label> <button>Prepare create</button> <small>The token cannot be changed afterwards. Capacities are provisional targets (4 and 16), not verified limits.</small></form>`);
  }
  if (st) {
    out.push(`<p><span class="state state-${st.state.toLowerCase()}">${esc(st.state.toUpperCase())}</span> creator ${esc(nameOf(st.creator))}; token ${esc(m.tokens.find((t) => t.address === st.token)?.name ?? short(st.token))} (fixed); participants: ${st.participants.map((p) => esc(nameOf(p))).join(', ')} (${st.participants.length} of ${st.maxParticipants} allowed).</p>`);
    out.push(`<p class="status-line">${esc(statusLine(m))}</p>`);
    if (st.state !== 'Settled') {
      out.push('<p class="stall-note">This session does not complete by itself. It stays in this state until the participants act: MVP-1 has no timeout, forced approval, abort, default or recovery, so one missing approval or authorization can keep it here indefinitely.</p>');
    }
  }
  out.push('</section>');

  if (st) {
    // membership and obligations
    out.push('<section><h2>Participants and obligations</h2>');
    out.push('<table><thead><tr><th>Debtor</th><th>Creditor</th><th>Amount</th><th>Id</th></tr></thead><tbody>');
    for (const o of st.obligations) out.push(`<tr><td>${esc(nameOf(o.debtor))}</td><td>${esc(nameOf(o.creditor))}</td><td>${o.amount}</td><td title="${o.id}">${esc(o.id.slice(0, 8))}...</td></tr>`);
    if (st.obligations.length === 0) out.push('<tr><td colspan="4">no obligations yet</td></tr>');
    out.push('</tbody></table>');
    if (st.state === 'Open') {
      out.push(`<form data-action="join"><label>Join as <select name="participant">${personaOptions(m)}</select></label> <button>Prepare join</button> <small>Needs two authorizations: the joiner's own and the session creator's. The creator gains no other power.</small></form>`);
      out.push(`<form data-action="obligation"><label>Debtor <select name="debtor">${personaOptions(m)}</select></label> <label>owes creditor <select name="creditor">${personaOptions(m)}</select></label> <label>amount <input name="amount" value="10" size="8"></label> <button>Prepare obligation</button> <small>Only the debtor authorizes; the creditor consents later by approving the whole proposal.</small></form>`);
      out.push(`<form data-action="finalize"><label>Freeze the obligations as <select name="caller">${personaOptions(m)}</select></label> <button>Prepare finalize</button> <small>Any admitted participant may. It cannot be undone and it settles nothing.</small></form>`);
    }
    out.push('</section>');

    // net positions
    out.push('<section><h2>Net positions</h2>');
    out.push('<table><thead><tr><th>Participant</th><th>Net (outgoing - incoming)</th><th>Role</th></tr></thead><tbody>');
    for (const n of st.nets) out.push(`<tr><td>${esc(nameOf(n.participant))}</td><td>${n.net}</td><td>${n.net > 0n ? 'net debtor' : n.net < 0n ? 'net creditor' : 'no net transfer'}</td></tr>`);
    out.push('</tbody></table>');
    if (st.state !== 'Open' && st.allZero) out.push('<p class="zero-note">Nothing to transfer: every net position is zero. The session still needs every participant\'s approval of the (empty) proposal and a completion call. It ends SETTLED with zero value moved and no token transfer is made.</p>');
    out.push('</section>');
  }

  if (st && st.state !== 'Open') {
    // proposal
    out.push('<section><h2>Settlement proposal</h2>');
    if (m.replacement) {
      out.push(`<p class="replacement-notice"><strong>Proposal replaced</strong> (revision ${m.replacement.fromRevision} to ${m.replacement.toRevision}). ${m.replacement.invalidated} earlier approval${m.replacement.invalidated === 1 ? ' was' : 's were'} invalidated: approvals count only for the current digest ${esc(sig(m.replacement.toDigest))}, and every participant must approve again.</p>`);
    }
    if (st.proposal) {
      const p = st.proposal;
      out.push(`<p>Current proposal: revision ${p.revision}, proposed by ${esc(nameOf(p.proposer))}, digest <code title="${p.digest}">${esc(sig(p.digest))}</code>${st.advice.currentIsDefault ? ' (identical to the default plan)' : st.advice.currentIsDefault === false ? ' (differs from the default plan; any valid plan is acceptable to the contract)' : ''}.</p>`);
      out.push(p.instructions.length ? `<table><thead><tr><th>#</th><th>Payer</th><th>Payee</th><th>Amount</th></tr></thead><tbody>${p.instructions.map((i, k) => `<tr><td>${k + 1}</td><td>${esc(nameOf(i.payer))}</td><td>${esc(nameOf(i.payee))}</td><td>${i.amount}</td></tr>`).join('')}</tbody></table>` : '<p>The proposal contains no transfers.</p>');
      if (m.digestCheck) {
        const ok = m.digestCheck.commitmentMatches && m.digestCheck.proposalMatches !== false && m.digestCheck.bytesMatch;
        out.push(`<p class="digest-check">Digest check: ${ok ? 'the digests recomputed in this page equal the ones the contract reports' : 'MISMATCH between the digests recomputed in this page and the contract\'s'} (digest format version 2, revision-bound, approved by the founder as the working MVP-1 format; not independently reviewed).</p>`);
      }
    } else {
      out.push('<p>No proposal yet.</p>');
    }
    if (st.state === 'Committed' || st.state === 'Approved') {
      const draftText = m.draft ? formatPlan(m.draft, nameOf) : '';
      out.push(`<form data-action="useDefault"><button>Generate the default proposal</button> <small>A deterministic starting point computed in this page. It is not authority: the contract accepts any plan that satisfies its rules and rejects any that does not.</small></form>`);
      out.push(`<form data-action="setDraft"><label>Draft plan (one transfer per line: Payer -&gt; Payee : amount)<br><textarea name="plan" rows="4" cols="40">${esc(draftText)}</textarea></label><br><button>Check draft</button></form>`);
      if (m.draft) {
        out.push(`<p class="draft-advice">Advisory check of the draft: ${m.draftAdvice ? (m.draftAdvice.ok ? 'passes the published rules' : `would be rejected (${esc(m.draftAdvice.error)}): ${esc(m.draftAdvice.message)}`) : 'not available'}. ${m.draftDigest ? `Digest it would have as revision ${(st.proposal?.revision ?? 0) + 1}: <code>${esc(sig(m.draftDigest))}</code>.` : ''} The contract decides.</p>`);
        out.push(`<form data-action="propose"><label>${st.proposal ? 'Replace the proposal' : 'Propose'} as <select name="proposer">${personaOptions(m)}</select></label> <button>Prepare ${st.proposal ? 'replacement' : 'proposal'}</button>${st.proposal ? ' <small>A replacement invalidates every earlier approval.</small>' : ''}</form>`);
      }
    }
    out.push('</section>');
  }

  if (st && st.proposal && st.state !== 'Open') {
    // approvals
    out.push(`<section><h2>Approvals of the current proposal (revision ${st.proposal.revision}, digest ${esc(sig(st.proposal.digest))})</h2>`);
    out.push('<table><thead><tr><th>Participant</th><th>Approved this digest</th><th></th></tr></thead><tbody>');
    for (const a of st.approvals) {
      out.push(`<tr><td>${esc(nameOf(a.participant))}</td><td>${a.approved ? 'yes' : 'not yet'}</td><td>${!a.approved && st.state === 'Committed' ? `<form data-action="approve"><input type="hidden" name="participant" value="${esc(nameOf(a.participant))}"><button>Prepare approval as ${esc(nameOf(a.participant))}</button></form>` : ''}</td></tr>`);
    }
    out.push('</tbody></table>');
    out.push(`<p>${st.missingApprovals.length === 0 ? 'Every admitted participant approved the current digest.' : `Missing approvals: ${st.missingApprovals.map((p) => esc(nameOf(p))).join(', ')}.`} An approval is for the complete proposal; it is not a debit authorization.</p>`);
    out.push('</section>');

    // settlement
    out.push('<section><h2>Settlement</h2>');
    if (st.state === 'Settled' && st.settlement) {
      const r = st.settlement;
      out.push(`<p class="settled-note"><strong>SETTLED</strong>, as recorded by the contract <em>in the local sandbox</em>. This is not a network transaction. ${r.instructionCount === 0 ? 'No transfer was made and zero value moved.' : `${r.instructionCount} transfer${r.instructionCount === 1 ? '' : 's'} moved ${r.totalMoved} in total, all together.`}</p>`);
    } else {
      out.push('<p><strong>Not settled.</strong></p>');
      if (st.debtorAuthorizations.length) {
        out.push(`<table><thead><tr><th>Debtor that must authorize</th><th>Own total</th><th>Transfers</th></tr></thead><tbody>${st.debtorAuthorizations.map((d) => `<tr><td>${esc(nameOf(d.debtor))}</td><td>${d.total}</td><td>${d.transfers.map((t) => `${esc(nameOf(t.to))} ${t.amount}`).join('; ')}</td></tr>`).join('')}</tbody></table>`);
        out.push('<p>Each listed debtor must authorize its own transfers. Anyone may submit the settlement; the submitter has no special role and approvals do not replace these authorizations.</p>');
      } else if (st.allZero) {
        out.push('<p>No debtor, so no debit authorization and no transfer.</p>');
      }
      if (st.state === 'Approved') out.push('<form data-action="settle"><button>Prepare settlement</button></form>');
      else out.push('<p>Settlement is not possible until every admitted participant has approved the current proposal.</p>');
    }
    out.push('</section>');
  }

  // pending action: what exactly is being asked, and who must authorize it
  if (m.pending) {
    const p = m.pending;
    out.push(`<section class="pending"><h2>Ready to send: ${esc(p.title)}</h2><p>${esc(p.call.description)}</p>`);
    if (p.willInvalidate > 0) out.push(`<p class="warn">Sending this replacement will invalidate ${p.willInvalidate} existing approval${p.willInvalidate === 1 ? '' : 's'}.</p>`);
    if (p.grants.length) {
      out.push('<p>Required authorizations (simulated local grants, no signature). Withhold one to watch the real contract reject the call.</p><ul>');
      for (const g of p.grants) out.push(`<li><label><input type="checkbox" data-grant="${esc(g.signer)}" ${g.granted ? 'checked' : ''}> ${esc(nameOf(g.signer))} authorizes: ${esc(g.purpose)}</label></li>`);
      out.push('</ul>');
    } else {
      out.push('<p>No authorization is required for this call.</p>');
    }
    out.push('<button data-action="confirm">Send to the local sandbox contract</button> <button data-action="cancel">Cancel</button></section>');
  }

  // log
  out.push('<section><h2>Activity in this sandbox</h2>');
  if (m.log.length === 0) out.push('<p>Nothing sent yet.</p>');
  else {
    out.push('<ol class="log" reversed>');
    for (const e of m.log) {
      const res = e.resources?.instructions !== undefined ? ` <small>(host-test estimate: ${e.resources.instructions} CPU instructions; not a network fee)</small>` : '';
      out.push(`<li class="${e.ok ? 'ok' : 'rejected'}"><strong>${esc(e.title)}</strong>: ${esc(e.message)}${res}</li>`);
    }
    out.push('</ol>');
  }
  out.push('</section>');
  return out.join('');
}

function personaOptions(m: Model): string {
  return m.personas.map((p) => `<option>${esc(p.name)}</option>`).join('');
}

/** One sentence on where the session stands. "settled" appears only for the contract's Settled state. */
export function statusLine(m: Model): string {
  const st = m.status;
  if (!st) return 'No session loaded.';
  switch (st.state) {
    case 'Open': return 'Open: participants may join and debtors may submit obligations. Nothing is frozen yet.';
    case 'Committed': return st.proposal ? `Committed: obligations are frozen; ${st.missingApprovals.length} approval${st.missingApprovals.length === 1 ? '' : 's'} missing for the current proposal. Not settled.` : 'Committed: obligations are frozen; waiting for a settlement proposal. Not settled.';
    case 'Approved': return 'Approved: every admitted participant approved the current proposal. Not settled until the debtors authorize and the settlement is executed.';
    case 'Settled': return 'Settled, as recorded by the contract in the local sandbox.';
  }
}
