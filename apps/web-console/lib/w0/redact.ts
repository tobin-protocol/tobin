// Output redaction for anything that reaches an audit record, an API response or the UI. The signer redacts its own output first (contract section 7);
// this is a second, independent layer. Hashes (64 hex) are public evidence values and are kept.

const PATTERNS: readonly [RegExp, string][] = [
  [/S[A-Z2-7]{55}/g, '[REDACTED-SEED]'],
  [/-----BEGIN [A-Z ]*-----[\s\S]*?(?:-----END [A-Z ]*-----|$)/g, '[REDACTED-PEM]'],
  [/[A-Za-z]:[\\/][^\s"'<>|]*/g, '[REDACTED-PATH]'],
  [/(?:^|(?<=[\s"'=(]))\/(?:home|Users|root|var|etc|tmp|opt|usr|mnt)\/[^\s"'<>|]*/g, '[REDACTED-PATH]'],
  [/\\\\[^\s"'<>|]+/g, '[REDACTED-PATH]'],
  [/\b(?:LOCALAPPDATA|APPDATA|USERPROFILE|NODE_OPTIONS|PATH|SECRET|TOKEN|PASSWORD)=\S*/gi, '[REDACTED-ENV]'],
  [/\bat\s+\S+\s+\([^)]*:\d+:\d+\)/g, '[REDACTED-STACK]'],
];

export function redact(text: string): string {
  let out = String(text);
  for (const [re, rep] of PATTERNS) out = out.replace(re, rep);
  return out;
}
