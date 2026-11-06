'use strict';
// Shared refusal type and secret redaction (moved out of the core so the authorization module can use them without a circular import).
class Refusal extends Error {}

const SECRET_RE = /S[A-Z2-7]{55}/g;
/** Removes anything shaped like a Stellar secret seed, and any literal secrets given, from text. */
function redact(text, literals = []) {
  let out = String(text).replace(SECRET_RE, '[REDACTED-SECRET]');
  for (const l of literals) if (l && l.length >= 8) out = out.split(l).join('[REDACTED-SECRET]');
  return out;
}
function refuse(msg) { throw new Refusal(redact(msg)); }

module.exports = { Refusal, redact, refuse };
