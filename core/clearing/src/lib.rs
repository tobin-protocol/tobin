//! TobinClearingV1: the clearing contract of the Tobin experimental MVP-1 (baseline "Phase B", contract core).
//!
//! Experimental. Not Tobin protocol v0.2 (no conformance claim, no v0.2 digest), not for deployment, test token only.
//! Design sources: the baseline specification `docs/spec/MVP-1 Implementation Specification — Draft 0.1.md` (S§n) and the earlier design-phase records, which are
//! internal and unpublished (CD = contract design, EQ-nn / DB-nn = decision identifiers). Engineering choices made while implementing are marked `CHOICE` and listed in `core/README.md`.
//!
//! Lifecycle: OPEN -> COMMITTED -> APPROVED -> SETTLED. No other state. A proposal is data inside COMMITTED/APPROVED, not a state.
//! * create_session: the creator authorizes, is admitted, and fixes the session's single token and capacities (immutable).
//! * join_session: needs BOTH the joiner's and the creator's authorization (two distinct `require_auth`), OPEN only.
//! * submit_obligation: the debtor authorizes; the creditor consents later by approving the whole proposal.
//! * finalize_obligations: any admitted participant; freezes participants, token and obligations; stores the obligation commitment.
//!   All-zero nets are allowed (no-transfer path).
//! * propose_settlement: any admitted participant; the contract validates the plan against explicit correctness rules and accepts ANY
//!   valid plan (it never compares the plan with an off-chain engine's output). Replaceable in COMMITTED or APPROVED; a replacement
//!   invalidates every earlier approval in the same invocation and leaves the session COMMITTED.
//! * approve_settlement: every admitted participant must approve the current proposal digest.
//! * settle: any caller. Needs the current digest, every participant's approval of it, and every debtor's authorization of exactly the
//!   transfers it owes. All-or-nothing: any failure reverts the whole invocation.
//!
//! No administrator, no override, no timeout, no abort, no default, no recovery, no upgrade. A session may stall forever (DB-06).
#![no_std]

use soroban_sdk::{
    contract, contractclient, contracterror, contractevent, contractimpl, contracttype, vec,
    xdr::ToXdr, Address, Bytes, BytesN, Env, IntoVal, Vec,
};

/// Provisional engineering TARGETS (S§11), not verified capacity limits. Compile-time constants: the contract has no administrator
/// and no mutable configuration (EQ-19).
pub const PARTICIPANT_CEILING: u32 = 4;
pub const OBLIGATION_CEILING: u32 = 16;
pub const INSTRUCTION_CEILING: u32 = 16;
/// Digest scheme version: the working MVP-1 format (version 2), approved by the founder as such (DB-09); a design decision, not independent cryptographic review (CD section 5).
pub const DIGEST_VERSION: u32 = 2;

/// Provisional storage-lifetime parameters in ledgers (about 30 and 60 days). [MEASURE]: not chosen from any measurement.
const LIFETIME_THRESHOLD: u32 = 17_280 * 30;
const LIFETIME_EXTEND: u32 = 17_280 * 60;

const DOMAIN_OBLIGATIONS: &[u8] = b"TOBIN-MVP1/OBLIGATIONS/v2";
const DOMAIN_SETTLEMENT: &[u8] = b"TOBIN-MVP1/SETTLEMENT/v2";

/// Stable error codes (CD section 8; retired codes 32, 39, 42 are not reused).
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    SessionNotFound = 1,
    SessionExists = 2,
    WrongState = 3,
    NotParticipant = 4,
    NoProposal = 5,
    MissingApproval = 6,
    TooManyParticipants = 10,
    ParticipantExists = 11,
    BadAddressKind = 12,
    BadCapacity = 13,
    TooManyObligations = 20,
    DuplicateObligation = 21,
    BadAmount = 22,
    SameParty = 23,
    UnknownParty = 24,
    ObligationNotFound = 25,
    TooFewParticipants = 30,
    NoObligations = 31,
    TooManyInstructions = 33,
    InstructionOrder = 34,
    InstructionSelfPay = 35,
    FlowMismatch = 36,
    OffsettingFlows = 37,
    Overflow = 38,
    DigestMismatch = 40,
    AlreadySettled = 50,
    CorruptState = 90,
}

#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum State {
    Open = 1,
    Committed = 2,
    Approved = 3,
    Settled = 4,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Obligation {
    pub id: BytesN<32>,
    pub debtor: Address,
    pub creditor: Address,
    pub amount: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Instruction {
    pub payer: Address,
    pub payee: Address,
    pub amount: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Session {
    pub creator: Address,
    pub token: Address,
    pub max_participants: u32,
    pub max_obligations: u32,
    pub state: State,
    /// admission order, the creator first
    pub participants: Vec<Address>,
    pub obligation_commitment: Option<BytesN<32>>,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Proposal {
    pub digest: BytesN<32>,
    pub instructions: Vec<Instruction>,
    pub proposer: Address,
    /// 1 for the first proposal, +1 per accepted replacement
    pub revision: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Approval {
    pub participant: Address,
    pub digest: BytesN<32>,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SettlementResult {
    pub digest: BytesN<32>,
    pub ledger_sequence: u32,
    pub total_moved: i128,
    pub instruction_count: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Config {
    pub version: u32,
    pub participant_ceiling: u32,
    pub obligation_ceiling: u32,
    pub instruction_ceiling: u32,
}

#[contracttype]
enum Key {
    Session(BytesN<32>),
    Obligations(BytesN<32>),
    Proposal(BytesN<32>),
    Approvals(BytesN<32>),
    Settlement(BytesN<32>),
}

/// The only token operation the contract uses. A local client (instead of the SDK's `token::Client`) keeps the call a plain
/// `transfer(from, to, amount)` with `Address` arguments, which the token's own `from.require_auth()` authorizes.
#[contractclient(name = "TokenClient")]
pub trait TokenTransfer {
    fn transfer(env: Env, from: Address, to: Address, amount: i128);
}

// ---- events (observability only; storage and balances are authoritative) ----

#[contractevent]
pub struct SessionCreated {
    #[topic]
    pub session_id: BytesN<32>,
    pub creator: Address,
    pub token: Address,
    pub max_participants: u32,
    pub max_obligations: u32,
}

#[contractevent]
pub struct ParticipantJoined {
    #[topic]
    pub session_id: BytesN<32>,
    pub participant: Address,
}

#[contractevent]
pub struct ObligationSubmitted {
    #[topic]
    pub session_id: BytesN<32>,
    #[topic]
    pub obligation_id: BytesN<32>,
    pub debtor: Address,
    pub creditor: Address,
    pub amount: i128,
}

#[contractevent]
pub struct ObligationsFinalized {
    #[topic]
    pub session_id: BytesN<32>,
    pub obligation_commitment: BytesN<32>,
    pub participants: u32,
    pub obligations: u32,
    pub all_nets_zero: bool,
}

#[contractevent]
pub struct SettlementProposed {
    #[topic]
    pub session_id: BytesN<32>,
    pub digest: BytesN<32>,
    pub proposer: Address,
    pub revision: u32,
    pub replaced: Option<BytesN<32>>,
    pub approvals_cleared: u32,
}

#[contractevent]
pub struct Approved {
    #[topic]
    pub session_id: BytesN<32>,
    #[topic]
    pub participant: Address,
    pub digest: BytesN<32>,
    pub approval_count: u32,
}

#[contractevent]
pub struct SessionApproved {
    #[topic]
    pub session_id: BytesN<32>,
    pub digest: BytesN<32>,
}

#[contractevent]
pub struct Settled {
    #[topic]
    pub session_id: BytesN<32>,
    pub digest: BytesN<32>,
    pub total_moved: i128,
    pub instruction_count: u32,
}

#[contract]
pub struct TobinClearingV1;

#[contractimpl]
impl TobinClearingV1 {
    /// The compile-time ceilings (provisional targets, not verified limits).
    pub fn config(_env: Env) -> Config {
        Config {
            version: 1,
            participant_ceiling: PARTICIPANT_CEILING,
            obligation_ceiling: OBLIGATION_CEILING,
            instruction_ceiling: INSTRUCTION_CEILING,
        }
    }

    /// The creator authorizes and is admitted. One token per session, selected here, immutable afterwards.
    pub fn create_session(
        env: Env,
        creator: Address,
        session_id: BytesN<32>,
        token: Address,
        max_participants: u32,
        max_obligations: u32,
    ) -> Result<(), Error> {
        if env
            .storage()
            .persistent()
            .has(&Key::Session(session_id.clone()))
        {
            return Err(Error::SessionExists);
        }
        xdr_of(&env, &creator)?; // account or contract address only
        if !is_contract_address(&env, &token)? {
            return Err(Error::BadAddressKind);
        }
        if max_participants < 2
            || max_participants > PARTICIPANT_CEILING
            || max_obligations < 1
            || max_obligations > OBLIGATION_CEILING
        {
            return Err(Error::BadCapacity);
        }
        creator.require_auth();
        let session = Session {
            creator: creator.clone(),
            token: token.clone(),
            max_participants,
            max_obligations,
            state: State::Open,
            participants: vec![&env, creator.clone()],
            obligation_commitment: None,
        };
        save_session(&env, &session_id, &session);
        SessionCreated {
            session_id: session_id.clone(),
            creator: creator.clone(),
            token,
            max_participants,
            max_obligations,
        }
        .publish(&env);
        ParticipantJoined {
            session_id,
            participant: creator,
        }
        .publish(&env);
        Ok(())
    }

    /// Admit `participant`. Needs the joiner's own authorization AND, separately, the creator's authorization of this joiner.
    /// The creator gains no other power (EQ-19).
    pub fn join_session(
        env: Env,
        session_id: BytesN<32>,
        participant: Address,
    ) -> Result<(), Error> {
        let mut s = load_session(&env, &session_id)?;
        if s.state != State::Open {
            return Err(Error::WrongState);
        }
        xdr_of(&env, &participant)?;
        if s.participants.contains(&participant) {
            return Err(Error::ParticipantExists);
        }
        if s.participants.len() >= s.max_participants {
            return Err(Error::TooManyParticipants);
        }
        participant.require_auth();
        s.creator.require_auth();
        s.participants.push_back(participant.clone());
        save_session(&env, &session_id, &s);
        ParticipantJoined {
            session_id,
            participant,
        }
        .publish(&env);
        Ok(())
    }

    /// Record an obligation. The debtor authorizes the full call. The id is caller-chosen; the contract enforces uniqueness only.
    pub fn submit_obligation(
        env: Env,
        session_id: BytesN<32>,
        obligation: Obligation,
    ) -> Result<(), Error> {
        let s = load_session(&env, &session_id)?;
        if s.state != State::Open {
            return Err(Error::WrongState);
        }
        if !s.participants.contains(&obligation.debtor)
            || !s.participants.contains(&obligation.creditor)
        {
            return Err(Error::UnknownParty);
        }
        if obligation.debtor == obligation.creditor {
            return Err(Error::SameParty);
        }
        if obligation.amount <= 0 {
            return Err(Error::BadAmount);
        }
        let mut list = load_obligations(&env, &session_id);
        if list.len() >= s.max_obligations {
            return Err(Error::TooManyObligations);
        }
        // sorted insertion by id (strictly ascending); an equal id is a duplicate
        let mut pos = list.len();
        for i in 0..list.len() {
            let existing = list.get(i).unwrap();
            if existing.id == obligation.id {
                return Err(Error::DuplicateObligation);
            }
            if existing.id > obligation.id {
                pos = i;
                break;
            }
        }
        list.insert(pos, obligation.clone());
        // CHOICE (EQ-12): overflow is prevented here, so a frozen set is always netable; recomputing also checks the total.
        compute_nets(&env, &s.participants, &list)?;
        obligation.debtor.require_auth();
        save_obligations(&env, &session_id, &list);
        ObligationSubmitted {
            session_id,
            obligation_id: obligation.id.clone(),
            debtor: obligation.debtor.clone(),
            creditor: obligation.creditor.clone(),
            amount: obligation.amount,
        }
        .publish(&env);
        Ok(())
    }

    /// Freeze participants, token and obligations; store the obligation commitment. Any admitted participant may call it.
    /// Edits nothing, proposes nothing, approves nothing. An all-zero-net set is allowed (EQ-15).
    pub fn finalize_obligations(
        env: Env,
        session_id: BytesN<32>,
        caller: Address,
    ) -> Result<BytesN<32>, Error> {
        let mut s = load_session(&env, &session_id)?;
        if s.state != State::Open {
            return Err(Error::WrongState);
        }
        if !s.participants.contains(&caller) {
            return Err(Error::NotParticipant);
        }
        if s.participants.len() < 2 {
            return Err(Error::TooFewParticipants);
        }
        let obligations = load_obligations(&env, &session_id);
        if obligations.is_empty() {
            return Err(Error::NoObligations);
        }
        caller.require_auth();
        let nets = compute_nets(&env, &s.participants, &obligations)?;
        let oc = obligation_commitment(&env, &session_id, &s, &obligations)?;
        s.obligation_commitment = Some(oc.clone());
        s.state = State::Committed;
        save_session(&env, &session_id, &s);
        ObligationsFinalized {
            session_id,
            obligation_commitment: oc.clone(),
            participants: s.participants.len(),
            obligations: obligations.len(),
            all_nets_zero: all_zero(&nets),
        }
        .publish(&env);
        Ok(oc)
    }

    /// Create or replace the settlement proposal. Any admitted participant may propose. The plan is validated against the frozen
    /// obligations BEFORE it becomes current; any valid plan is accepted. A replacement invalidates all approvals and leaves the
    /// session COMMITTED, in this one invocation: if any step fails nothing is written.
    pub fn propose_settlement(
        env: Env,
        session_id: BytesN<32>,
        proposer: Address,
        instructions: Vec<Instruction>,
    ) -> Result<BytesN<32>, Error> {
        let mut s = load_session(&env, &session_id)?;
        if s.state != State::Committed && s.state != State::Approved {
            return Err(Error::WrongState);
        }
        if !s.participants.contains(&proposer) {
            return Err(Error::NotParticipant);
        }
        proposer.require_auth();
        let obligations = load_obligations(&env, &session_id);
        validate_plan(&env, &s, &obligations, &instructions)?;
        let oc = s.obligation_commitment.clone().ok_or(Error::CorruptState)?;
        // EQ-05: the revision is bound into the digest, so a signature for one revision can never authorize another, even when the
        // instructions are identical (A -> B -> A). The revision only ever increases; at u32::MAX a further replacement fails with
        // Overflow BEFORE anything is written, leaving the current proposal, revision and approvals untouched.
        let old: Option<Proposal> = env
            .storage()
            .persistent()
            .get(&Key::Proposal(session_id.clone()));
        let (revision, replaced) = match &old {
            Some(p) => (
                p.revision.checked_add(1).ok_or(Error::Overflow)?,
                Some(p.digest.clone()),
            ),
            None => (1u32, None),
        };
        let digest = proposal_digest(&env, &session_id, &s, &oc, revision, &instructions)?;
        let cleared = load_approvals(&env, &session_id).len();
        let proposal = Proposal {
            digest: digest.clone(),
            instructions,
            proposer: proposer.clone(),
            revision,
        };
        let pk = Key::Proposal(session_id.clone());
        env.storage().persistent().set(&pk, &proposal);
        bump(&env, &pk);
        env.storage()
            .persistent()
            .remove(&Key::Approvals(session_id.clone()));
        s.state = State::Committed;
        save_session(&env, &session_id, &s);
        SettlementProposed {
            session_id,
            digest: digest.clone(),
            proposer,
            revision,
            replaced,
            approvals_cleared: cleared,
        }
        .publish(&env);
        Ok(digest)
    }

    /// Approve the COMPLETE current proposal (obligations, nets, instructions, token, identity), not one obligation. Every admitted
    /// participant must approve. Returns true when this call completed the set (state becomes APPROVED in the same transaction).
    pub fn approve_settlement(
        env: Env,
        session_id: BytesN<32>,
        participant: Address,
        digest: BytesN<32>,
    ) -> Result<bool, Error> {
        let mut s = load_session(&env, &session_id)?;
        if s.state != State::Committed {
            return Err(Error::WrongState);
        }
        let proposal: Proposal = env
            .storage()
            .persistent()
            .get(&Key::Proposal(session_id.clone()))
            .ok_or(Error::NoProposal)?;
        if !s.participants.contains(&participant) {
            return Err(Error::NotParticipant);
        }
        if digest != proposal.digest {
            return Err(Error::DigestMismatch);
        }
        participant.require_auth();
        let mut approvals = load_approvals(&env, &session_id);
        for a in approvals.iter() {
            if a.participant == participant && a.digest == proposal.digest {
                return Ok(false); // exact duplicate: idempotent, no change
            }
        }
        approvals.push_back(Approval {
            participant: participant.clone(),
            digest: proposal.digest.clone(),
        });
        let count = count_current(&approvals, &proposal.digest);
        let complete = count == s.participants.len();
        save_approvals(&env, &session_id, &approvals);
        Approved {
            session_id: session_id.clone(),
            participant,
            digest: proposal.digest.clone(),
            approval_count: count,
        }
        .publish(&env);
        if complete {
            s.state = State::Approved;
            save_session(&env, &session_id, &s);
            SessionApproved {
                session_id,
                digest: proposal.digest,
            }
            .publish(&env);
        }
        Ok(complete)
    }

    /// Execute the settlement. NO restriction on who submits: submission is not authority. Everything is independently checked and the
    /// whole invocation is all-or-nothing. With an empty proposal (all nets zero) no token call is made (no-transfer path).
    pub fn settle(env: Env, session_id: BytesN<32>, digest: BytesN<32>) -> Result<(), Error> {
        let mut s = load_session(&env, &session_id)?;
        match s.state {
            State::Settled => return Err(Error::AlreadySettled),
            State::Open => return Err(Error::WrongState),
            State::Committed => {
                return if env
                    .storage()
                    .persistent()
                    .has(&Key::Proposal(session_id.clone()))
                {
                    Err(Error::MissingApproval)
                } else {
                    Err(Error::NoProposal)
                };
            }
            State::Approved => {}
        }
        let proposal: Proposal = env
            .storage()
            .persistent()
            .get(&Key::Proposal(session_id.clone()))
            .ok_or(Error::CorruptState)?;
        if digest != proposal.digest {
            return Err(Error::DigestMismatch);
        }
        // every admitted participant has an approval of THIS digest (APPROVED implies it; fail closed otherwise)
        let approvals = load_approvals(&env, &session_id);
        for p in s.participants.iter() {
            let mut found = false;
            for a in approvals.iter() {
                if a.participant == p && a.digest == proposal.digest {
                    found = true;
                }
            }
            if !found {
                return Err(Error::CorruptState);
            }
        }
        // CHOICE (EQ-11): re-validate on settlement. The stored plan was validated when proposed; a mismatch now means corrupt state.
        let obligations = load_obligations(&env, &session_id);
        let oc = obligation_commitment(&env, &session_id, &s, &obligations)?;
        if Some(oc.clone()) != s.obligation_commitment {
            return Err(Error::CorruptState);
        }
        if validate_plan(&env, &s, &obligations, &proposal.instructions).is_err() {
            return Err(Error::CorruptState);
        }
        if proposal_digest(
            &env,
            &session_id,
            &s,
            &oc,
            proposal.revision,
            &proposal.instructions,
        )? != proposal.digest
        {
            return Err(Error::CorruptState);
        }
        // Each distinct payer authorizes THIS settlement: (session id, digest, its own total debit). Instructions are ordered by payer,
        // so a payer's instructions are contiguous.
        let mut grand: i128 = 0;
        let mut i = 0;
        let n = proposal.instructions.len();
        while i < n {
            let payer = proposal.instructions.get(i).unwrap().payer;
            let mut total: i128 = 0;
            let mut j = i;
            while j < n {
                let ins = proposal.instructions.get(j).unwrap();
                if ins.payer != payer {
                    break;
                }
                total = total.checked_add(ins.amount).ok_or(Error::Overflow)?;
                j += 1;
            }
            payer.require_auth_for_args(vec![
                &env,
                session_id.into_val(&env),
                digest.into_val(&env),
                total.into_val(&env),
            ]);
            grand = grand.checked_add(total).ok_or(Error::Overflow)?;
            i = j;
        }
        // The terminal record and the state are written BEFORE the transfers on purpose: a failing transfer reverts them too.
        let result = SettlementResult {
            digest: proposal.digest.clone(),
            ledger_sequence: env.ledger().sequence(),
            total_moved: grand,
            instruction_count: n,
        };
        let rk = Key::Settlement(session_id.clone());
        env.storage().persistent().set(&rk, &result);
        bump(&env, &rk);
        s.state = State::Settled;
        save_session(&env, &session_id, &s);
        // Direct transfers of the SESSION token. A failed transfer is not ignored: it propagates and the invocation reverts.
        let token = TokenClient::new(&env, &s.token);
        for ins in proposal.instructions.iter() {
            token.transfer(&ins.payer, &ins.payee, &ins.amount);
        }
        Settled {
            session_id,
            digest: proposal.digest,
            total_moved: grand,
            instruction_count: n,
        }
        .publish(&env);
        Ok(())
    }

    // ---- queries (no authorization, no state change) ----

    pub fn get_session(env: Env, session_id: BytesN<32>) -> Result<Session, Error> {
        load_session(&env, &session_id)
    }

    pub fn get_obligations(env: Env, session_id: BytesN<32>) -> Result<Vec<Obligation>, Error> {
        load_session(&env, &session_id)?;
        Ok(load_obligations(&env, &session_id))
    }

    pub fn get_obligation(
        env: Env,
        session_id: BytesN<32>,
        id: BytesN<32>,
    ) -> Result<Obligation, Error> {
        load_session(&env, &session_id)?;
        for o in load_obligations(&env, &session_id).iter() {
            if o.id == id {
                return Ok(o);
            }
        }
        Err(Error::ObligationNotFound)
    }

    pub fn get_commitment(env: Env, session_id: BytesN<32>) -> Result<BytesN<32>, Error> {
        load_session(&env, &session_id)?
            .obligation_commitment
            .ok_or(Error::WrongState)
    }

    /// The current settlement proposal (digest, instructions, proposer, revision), or `NoProposal`.
    pub fn get_proposal(env: Env, session_id: BytesN<32>) -> Result<Proposal, Error> {
        load_session(&env, &session_id)?;
        env.storage()
            .persistent()
            .get(&Key::Proposal(session_id))
            .ok_or(Error::NoProposal)
    }

    /// The terminal record of a settled session, or `WrongState` before settlement.
    pub fn get_settlement(env: Env, session_id: BytesN<32>) -> Result<SettlementResult, Error> {
        load_session(&env, &session_id)?;
        env.storage()
            .persistent()
            .get(&Key::Settlement(session_id))
            .ok_or(Error::WrongState)
    }

    pub fn get_approvals(env: Env, session_id: BytesN<32>) -> Result<Vec<Approval>, Error> {
        load_session(&env, &session_id)?;
        Ok(load_approvals(&env, &session_id))
    }

    pub fn get_approval(
        env: Env,
        session_id: BytesN<32>,
        participant: Address,
    ) -> Result<Option<Approval>, Error> {
        load_session(&env, &session_id)?;
        for a in load_approvals(&env, &session_id).iter() {
            if a.participant == participant {
                return Ok(Some(a));
            }
        }
        Ok(None)
    }

    /// The canonical bytes that the obligation commitment hashes (lets an independent implementation compare bytes, not only digests).
    pub fn commitment_bytes(env: Env, session_id: BytesN<32>) -> Result<Bytes, Error> {
        let s = load_session(&env, &session_id)?;
        if s.obligation_commitment.is_none() {
            return Err(Error::WrongState);
        }
        obligation_bytes(&env, &session_id, &s, &load_obligations(&env, &session_id))
    }

    /// The canonical bytes that the current proposal digest hashes.
    pub fn proposal_bytes(env: Env, session_id: BytesN<32>) -> Result<Bytes, Error> {
        let s = load_session(&env, &session_id)?;
        let p: Proposal = env
            .storage()
            .persistent()
            .get(&Key::Proposal(session_id.clone()))
            .ok_or(Error::NoProposal)?;
        let oc = s.obligation_commitment.clone().ok_or(Error::CorruptState)?;
        proposal_bytes_of(&env, &session_id, &s, &oc, p.revision, &p.instructions)
    }
}

// ---------------------------------------------------------------------------------------------------------------------------------
// storage helpers

fn bump(env: &Env, key: &Key) {
    env.storage()
        .persistent()
        .extend_ttl(key, LIFETIME_THRESHOLD, LIFETIME_EXTEND);
    // the contract instance entry (and so the contract) must stay alive as long as the records it serves
    env.storage()
        .instance()
        .extend_ttl(LIFETIME_THRESHOLD, LIFETIME_EXTEND);
}

fn load_session(env: &Env, sid: &BytesN<32>) -> Result<Session, Error> {
    env.storage()
        .persistent()
        .get(&Key::Session(sid.clone()))
        .ok_or(Error::SessionNotFound)
}

fn save_session(env: &Env, sid: &BytesN<32>, s: &Session) {
    let k = Key::Session(sid.clone());
    env.storage().persistent().set(&k, s);
    bump(env, &k);
}

fn load_obligations(env: &Env, sid: &BytesN<32>) -> Vec<Obligation> {
    env.storage()
        .persistent()
        .get(&Key::Obligations(sid.clone()))
        .unwrap_or(Vec::new(env))
}

fn save_obligations(env: &Env, sid: &BytesN<32>, v: &Vec<Obligation>) {
    let k = Key::Obligations(sid.clone());
    env.storage().persistent().set(&k, v);
    bump(env, &k);
}

fn load_approvals(env: &Env, sid: &BytesN<32>) -> Vec<Approval> {
    env.storage()
        .persistent()
        .get(&Key::Approvals(sid.clone()))
        .unwrap_or(Vec::new(env))
}

fn save_approvals(env: &Env, sid: &BytesN<32>, v: &Vec<Approval>) {
    let k = Key::Approvals(sid.clone());
    env.storage().persistent().set(&k, v);
    bump(env, &k);
}

/// Approvals whose digest equals the current one. Stale approvals never count (defense in depth beside the clearing in `propose_settlement`).
fn count_current(approvals: &Vec<Approval>, digest: &BytesN<32>) -> u32 {
    let mut n = 0u32;
    for a in approvals.iter() {
        if &a.digest == digest {
            n += 1;
        }
    }
    n
}

// ---------------------------------------------------------------------------------------------------------------------------------
// addresses

/// XDR of `ScVal::Address` for an account (44 bytes) or a contract (40 bytes) address; any other kind is rejected.
fn xdr_of(env: &Env, a: &Address) -> Result<Bytes, Error> {
    let x = a.clone().to_xdr(env);
    let n = x.len();
    let ok = (n == 44
        && x.slice(0..12) == Bytes::from_array(env, &[0, 0, 0, 0x12, 0, 0, 0, 0, 0, 0, 0, 0]))
        || (n == 40 && x.slice(0..8) == Bytes::from_array(env, &[0, 0, 0, 0x12, 0, 0, 0, 1]));
    if ok {
        Ok(x)
    } else {
        Err(Error::BadAddressKind)
    }
}

fn is_contract_address(env: &Env, a: &Address) -> Result<bool, Error> {
    Ok(xdr_of(env, a)?.len() == 40)
}

/// The raw 32-byte contract id of a contract address.
fn contract_id32(env: &Env, a: &Address) -> Result<BytesN<32>, Error> {
    let x = xdr_of(env, a)?;
    if x.len() != 40 {
        return Err(Error::BadAddressKind);
    }
    let mut arr = [0u8; 32];
    x.slice(8..40).copy_into_slice(&mut arr);
    Ok(BytesN::from_array(env, &arr))
}

// ---------------------------------------------------------------------------------------------------------------------------------
// netting and plan validation (CD section 6)

fn all_zero(nets: &Vec<i128>) -> bool {
    for n in nets.iter() {
        if n != 0 {
            return false;
        }
    }
    true
}

/// Net position of every participant (admission order) with the baseline convention: N = outgoing - incoming. Positive = net debtor.
/// All arithmetic is checked; the sum of all obligation amounts is checked too, so no later total can overflow.
fn compute_nets(
    env: &Env,
    participants: &Vec<Address>,
    obligations: &Vec<Obligation>,
) -> Result<Vec<i128>, Error> {
    let n = participants.len();
    let mut out: Vec<i128> = Vec::new(env);
    let mut inn: Vec<i128> = Vec::new(env);
    for _ in 0..n {
        out.push_back(0);
        inn.push_back(0);
    }
    let mut grand: i128 = 0;
    for o in obligations.iter() {
        let d = participants
            .first_index_of(&o.debtor)
            .ok_or(Error::UnknownParty)?;
        let c = participants
            .first_index_of(&o.creditor)
            .ok_or(Error::UnknownParty)?;
        out.set(
            d,
            out.get(d)
                .unwrap()
                .checked_add(o.amount)
                .ok_or(Error::Overflow)?,
        );
        inn.set(
            c,
            inn.get(c)
                .unwrap()
                .checked_add(o.amount)
                .ok_or(Error::Overflow)?,
        );
        grand = grand.checked_add(o.amount).ok_or(Error::Overflow)?;
    }
    let mut nets: Vec<i128> = Vec::new(env);
    for i in 0..n {
        nets.push_back(
            out.get(i)
                .unwrap()
                .checked_sub(inn.get(i).unwrap())
                .ok_or(Error::Overflow)?,
        );
    }
    Ok(nets)
}

/// The correctness rules every accepted plan satisfies (CD 6.2). The contract accepts ANY plan that passes; it never compares the plan
/// with an off-chain engine's output.
/// 1 valid parties, positive amounts, payer != payee, count <= ceiling, empty only when every net is zero;
/// 2 nets from the frozen obligations; 3 debit[p] = max(0, N_p) and credit[p] = max(0, -N_p) (no one pays more than the net debit or
/// receives more than the net credit; conservation follows); 5 no value omitted, duplicated or introduced;
/// 6 CHOICE (EQ-01): instructions strictly ascending by (payer, payee) as XDR bytes, so no repeated pair and an unambiguous encoding;
/// 7 checked arithmetic.
fn validate_plan(
    env: &Env,
    s: &Session,
    obligations: &Vec<Obligation>,
    ins: &Vec<Instruction>,
) -> Result<(), Error> {
    if ins.len() > INSTRUCTION_CEILING {
        return Err(Error::TooManyInstructions);
    }
    let nets = compute_nets(env, &s.participants, obligations)?;
    let n = s.participants.len();
    let mut debit: Vec<i128> = Vec::new(env);
    let mut credit: Vec<i128> = Vec::new(env);
    for _ in 0..n {
        debit.push_back(0);
        credit.push_back(0);
    }
    let mut prev: Option<(Bytes, Bytes)> = None;
    for k in ins.iter() {
        if k.amount <= 0 {
            return Err(Error::BadAmount);
        }
        if k.payer == k.payee {
            return Err(Error::InstructionSelfPay);
        }
        let pi = s
            .participants
            .first_index_of(&k.payer)
            .ok_or(Error::UnknownParty)?;
        let ci = s
            .participants
            .first_index_of(&k.payee)
            .ok_or(Error::UnknownParty)?;
        let key = (xdr_of(env, &k.payer)?, xdr_of(env, &k.payee)?);
        if let Some(p) = &prev {
            if !(p.0 < key.0 || (p.0 == key.0 && p.1 < key.1)) {
                return Err(Error::InstructionOrder);
            }
        }
        prev = Some(key);
        debit.set(
            pi,
            debit
                .get(pi)
                .unwrap()
                .checked_add(k.amount)
                .ok_or(Error::Overflow)?,
        );
        credit.set(
            ci,
            credit
                .get(ci)
                .unwrap()
                .checked_add(k.amount)
                .ok_or(Error::Overflow)?,
        );
    }
    for i in 0..n {
        let net = nets.get(i).unwrap();
        let d = debit.get(i).unwrap();
        let c = credit.get(i).unwrap();
        if d > 0 && c > 0 {
            return Err(Error::OffsettingFlows);
        }
        let want_debit = if net > 0 { net } else { 0 };
        let want_credit = if net < 0 {
            net.checked_neg().ok_or(Error::Overflow)?
        } else {
            0
        };
        if d != want_debit || c != want_credit {
            return Err(Error::FlowMismatch);
        }
    }
    Ok(())
}

// ---------------------------------------------------------------------------------------------------------------------------------
// canonical bytes and digests (CD section 5). Working version 2, approved by the founder as the working MVP-1 format (DB-09); not independent cryptographic review.
// Primitives: u32 and i128 big-endian; ids 32 raw bytes; address = one length byte (44 account, 40 contract) then the XDR of
// ScVal::Address; collection = u32 count then the elements. Domain tags are length-prefixed (one byte).

fn put_domain(b: &mut Bytes, tag: &[u8]) {
    b.push_back(tag.len() as u8);
    b.extend_from_slice(tag);
}

fn put_u32(b: &mut Bytes, v: u32) {
    b.extend_from_array(&v.to_be_bytes());
}

fn put_i128(b: &mut Bytes, v: i128) {
    b.extend_from_array(&v.to_be_bytes());
}

fn put_id(b: &mut Bytes, v: &BytesN<32>) {
    b.extend_from_array(&v.to_array());
}

fn put_addr(env: &Env, b: &mut Bytes, a: &Address) -> Result<(), Error> {
    let x = xdr_of(env, a)?;
    b.push_back(x.len() as u8);
    b.append(&x);
    Ok(())
}

fn header(env: &Env, tag: &[u8], sid: &BytesN<32>, s: &Session) -> Result<Bytes, Error> {
    let mut b = Bytes::new(env);
    put_domain(&mut b, tag);
    put_u32(&mut b, DIGEST_VERSION);
    put_id(&mut b, &env.ledger().network_id());
    put_id(
        &mut b,
        &contract_id32(env, &env.current_contract_address())?,
    );
    put_id(&mut b, sid);
    put_id(&mut b, &contract_id32(env, &s.token)?);
    Ok(b)
}

/// Bytes of the obligation commitment: header, participants ascending by XDR bytes, obligations strictly ascending by id.
fn obligation_bytes(
    env: &Env,
    sid: &BytesN<32>,
    s: &Session,
    obligations: &Vec<Obligation>,
) -> Result<Bytes, Error> {
    let mut b = header(env, DOMAIN_OBLIGATIONS, sid, s)?;
    // participants sorted ascending by their XDR bytes (insertion sort, at most 4)
    let mut sorted: Vec<Bytes> = Vec::new(env);
    for p in s.participants.iter() {
        let x = xdr_of(env, &p)?;
        let mut pos = sorted.len();
        for i in 0..sorted.len() {
            if sorted.get(i).unwrap() > x {
                pos = i;
                break;
            }
        }
        sorted.insert(pos, x);
    }
    put_u32(&mut b, sorted.len());
    for x in sorted.iter() {
        b.push_back(x.len() as u8);
        b.append(&x);
    }
    // obligations are stored strictly ascending by id (sorted insertion in `submit_obligation`)
    put_u32(&mut b, obligations.len());
    for o in obligations.iter() {
        put_id(&mut b, &o.id);
        put_addr(env, &mut b, &o.debtor)?;
        put_addr(env, &mut b, &o.creditor)?;
        put_i128(&mut b, o.amount);
    }
    Ok(b)
}

fn obligation_commitment(
    env: &Env,
    sid: &BytesN<32>,
    s: &Session,
    obligations: &Vec<Obligation>,
) -> Result<BytesN<32>, Error> {
    Ok(env
        .crypto()
        .sha256(&obligation_bytes(env, sid, s, obligations)?)
        .to_bytes())
}

/// Bytes of the proposal digest: header, the obligation commitment, the proposal REVISION (u32, big-endian), the instructions exactly as
/// submitted (already validated to be in the contract's order). Two different valid plans, or the same plan at two revisions, have different digests.
fn proposal_bytes_of(
    env: &Env,
    sid: &BytesN<32>,
    s: &Session,
    oc: &BytesN<32>,
    revision: u32,
    ins: &Vec<Instruction>,
) -> Result<Bytes, Error> {
    let mut b = header(env, DOMAIN_SETTLEMENT, sid, s)?;
    put_id(&mut b, oc);
    put_u32(&mut b, revision);
    put_u32(&mut b, ins.len());
    for k in ins.iter() {
        put_addr(env, &mut b, &k.payer)?;
        put_addr(env, &mut b, &k.payee)?;
        put_i128(&mut b, k.amount);
    }
    Ok(b)
}

fn proposal_digest(
    env: &Env,
    sid: &BytesN<32>,
    s: &Session,
    oc: &BytesN<32>,
    revision: u32,
    ins: &Vec<Instruction>,
) -> Result<BytesN<32>, Error> {
    Ok(env
        .crypto()
        .sha256(&proposal_bytes_of(env, sid, s, oc, revision, ins)?)
        .to_bytes())
}
