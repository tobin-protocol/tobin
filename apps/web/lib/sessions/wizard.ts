// The create-session wizard's recovery logic. Creating a session is not atomic in the backend: the session is created first, then each participant is added
// with its own request. When some of those fail the session still exists, so the wizard shows ONE recovery panel and retries ONLY the participants that failed.
// Pure apart from the injected `add`, so it is unit-tested.
export interface Candidate { userId: string; name: string }
export interface AddFailure { userId: string; name: string; reason: string }
export interface AddOutcome { added: Candidate[]; failed: AddFailure[] }

/** Adds each candidate with its own request and sorts the results into added and failed. Never throws for a single failure. */
export async function addParticipants(candidates: readonly Candidate[], add: (userId: string) => Promise<void>, reasonOf: (e: unknown) => string): Promise<AddOutcome> {
  const added: Candidate[] = [];
  const failed: AddFailure[] = [];
  for (const c of candidates) {
    try { await add(c.userId); added.push(c); } catch (e) { failed.push({ userId: c.userId, name: c.name, reason: reasonOf(e) }); }
  }
  return { added, failed };
}

/** Retries only what failed and folds the result into the earlier outcome: what was added stays added, and only what still fails remains in `failed`. */
export async function retryFailed(previous: AddOutcome, add: (userId: string) => Promise<void>, reasonOf: (e: unknown) => string): Promise<AddOutcome> {
  const again = await addParticipants(previous.failed.map((f) => ({ userId: f.userId, name: f.name })), add, reasonOf);
  return { added: [...previous.added, ...again.added], failed: again.failed };
}

export type RecoveryView = { kind: "complete" } | { kind: "partial"; headline: string; failed: AddFailure[] };
export function recoveryOf(outcome: AddOutcome): RecoveryView {
  if (outcome.failed.length === 0) return { kind: "complete" };
  const n = outcome.failed.length;
  return { kind: "partial", headline: `${n} participant${n === 1 ? " was" : "s were"} not added`, failed: outcome.failed };
}
