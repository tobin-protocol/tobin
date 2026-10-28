// Inventory of the root npm lockfile (npm workspaces) for the dependency governance tooling. Pure functions, no network, no dependencies.
//
// What this is: a PACKAGE INVENTORY with the licence expression EXACTLY as the package metadata in package-lock.json supplies it, the dependency scope
// npm records for it, and whether npm restricts it to some platforms. The `flags` are triage labels derived mechanically from the licence string so that
// a human reviewer can find the entries that need attention. They are NOT a licence-compatibility assessment, NOT a statement about attribution or
// notice obligations, and NOT legal advice.

export const COMMON_LABELS = new Set(['MIT', 'ISC', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause']);

/** Triage labels for a licence expression (semicolon-joinable). Order is fixed so that the output is deterministic. */
export function licenceFlags(expr) {
  if (!expr) return ['missing-metadata'];
  const flags = [];
  if (/\b(A|L)?GPL/i.test(expr)) flags.push(/\bLGPL/i.test(expr) ? 'lgpl' : 'gpl-family');
  if (/\bMPL/i.test(expr)) flags.push('mpl');
  if (/\bCC-BY|\bCC0/i.test(expr)) flags.push('data-or-content-licence');
  if (/\b(AND|WITH|OR)\b/.test(expr)) flags.push('compound-expression');
  const atoms = expr.replace(/[()]/g, ' ').split(/\s+(?:AND|OR|WITH)\s+/).map((s) => s.trim()).filter(Boolean);
  if (atoms.some((a) => !COMMON_LABELS.has(a) && !/GPL|MPL|CC-BY|CC0/i.test(a))) flags.push('uncommon-label');
  return flags;
}

/** The scope npm records: prod, dev, optional, dev+optional, devOptional (a dev/optional mix) or peer, relative to the whole workspace. */
export function scopeOf(v) {
  const parts = [v.dev && 'dev', v.optional && 'optional', v.devOptional && 'devOptional', v.peer && 'peer', v.inBundle && 'bundled'].filter(Boolean);
  return parts.length ? parts.join('+') : 'prod';
}

export const platformOf = (v) => [v.os && `os=${[].concat(v.os).join('|')}`, v.cpu && `cpu=${[].concat(v.cpu).join('|')}`, v.libc && `libc=${[].concat(v.libc).join('|')}`].filter(Boolean).join(' ');

/**
 * Entries of a package-lock.json (lockfileVersion 3):
 *  - `npm-workspace`: this repository's own packages (apps/*, packages/*); not third-party
 *  - `npm`: every package under node_modules (links to workspaces are skipped)
 */
export function npmInventory(lock) {
  const out = [];
  for (const [k, v] of Object.entries(lock.packages ?? {})) {
    if (!k) continue;
    if (v.link) continue;
    if (!k.includes('node_modules/')) {
      out.push({ eco: 'npm-workspace', name: k, ver: v.version ?? '', lic: v.license ?? '', scope: 'workspace', platform: '', flags: [] });
      continue;
    }
    const lic = v.license ? (typeof v.license === 'string' ? v.license : JSON.stringify(v.license)) : '';
    out.push({ eco: 'npm', name: k.replace(/^.*node_modules\//, ''), ver: v.version ?? '', lic, scope: scopeOf(v), platform: platformOf(v), flags: licenceFlags(lic) });
  }
  return out.sort((a, b) => (a.eco + a.name + a.ver).localeCompare(b.eco + b.name + b.ver));
}
