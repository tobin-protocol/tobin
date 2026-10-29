// The per-file rules of the release-gate source-tree scan (input to gate G09). Pure functions (no file or git access except the one schema read), so
// they can be tested without a repository. scripts/release/check-gates.mjs lists the files and calls scanFile for each.
import { readFileSync } from 'node:fs';

/** The one file whose contract-ID-shaped strings are accepted, and only if it validates against the schema next to it. */
export const TESTNET_MANIFEST_PATH = 'contracts/deployments/testnet.json';
const SCHEMA = JSON.parse(readFileSync(new URL('../../contracts/deployments/testnet.schema.json', import.meta.url), 'utf8'));

const BAD_PATH = /(^|\/)(auth-vectors|authvectors|auth-intent)|(^|\/)CLAUDE\.md$|phase-e|PHASE-E|phase-b|PHASE-B|(^|\/)m0-review(\/|$)|(^|\/)(node_modules|dist|target)\/|\.badge-profile|(^|\/)\.env|\.pem$|\.key$|^archive\//;
// Synthetic test data only: fixture directories and the strkey codec test (all-zero / 0x..01 addresses, not deployed contracts).
const FIXTURE_DIRS = /^(contracts\/clearing\/tests\/fixtures\/|packages\/mvp1-sdk\/test\/fixtures\/|packages\/mvp1-sdk\/test\/primitives\.test\.ts$)/;
const RULES = [
  [/\bS[A-Z2-7]{55}\b/, 'Stellar secret-seed-shaped string'],
  [/BEGIN [A-Z ]*PRIVATE KEY/, 'private key block'],
  [/[A-Za-z]:\\Users\\|\/c\/Users\/|\/home\/[a-z]/, 'absolute local user path'],
];
const CONTRACT_ID = /\bC[A-Z2-7]{55}\b/;
const MAINNET = /Public Global Stellar Network|mainnet/i;

/** Validates `value` against the subset of JSON Schema the manifest schema uses; returns a list of problems (empty when valid). */
export function validate(schema, value, root = schema, path = '$') {
  if (schema.$ref) return validate(root.definitions[schema.$ref.split('/').pop()], value, root, path);
  const out = [];
  if (schema.type === 'object') {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return [`${path}: expected an object`];
    for (const k of schema.required || []) if (!(k in value)) out.push(`${path}.${k}: missing`);
    for (const [k, v] of Object.entries(value)) {
      if (schema.properties && k in schema.properties) out.push(...validate(schema.properties[k], v, root, `${path}.${k}`));
      else if (schema.additionalProperties === false) out.push(`${path}.${k}: not allowed`);
    }
  } else if (schema.type === 'string') {
    if (typeof value !== 'string') return [`${path}: expected a string`];
    if ('const' in schema && value !== schema.const) out.push(`${path}: must be "${schema.const}"`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) out.push(`${path}: does not match the required format`);
  }
  return out;
}

/** Problems with a candidate Testnet manifest (empty when it is acceptable). A Mainnet manifest always has problems. */
export function manifestProblems(text) {
  let obj;
  try { obj = JSON.parse(text); } catch { return ['not valid JSON']; }
  const problems = validate(SCHEMA, obj);
  if (MAINNET.test(text)) problems.push('mentions Mainnet');
  return problems;
}

/** Findings for one file. `f` is the repository-relative path (forward slashes), `text` its content. */
export function scanFile(f, text) {
  const findings = [];
  if (BAD_PATH.test(f)) findings.push(`excluded or unsuitable path tracked: ${f}`);
  for (const [re, label] of RULES) if (re.test(text)) findings.push(`${label}: ${f}`);
  if (CONTRACT_ID.test(text) && !FIXTURE_DIRS.test(f)) {
    if (f === TESTNET_MANIFEST_PATH) {
      const problems = manifestProblems(text);
      if (problems.length) findings.push(`contract-id-shaped string in an invalid Testnet deployment manifest (${problems.slice(0, 3).join('; ')}): ${f}`);
    } else {
      findings.push(`contract-id-shaped string outside test fixtures: ${f}`);
    }
  }
  return findings;
}
