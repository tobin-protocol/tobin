// After the organization changes, a page that belongs to the previous organization must not stay open: a session id from one organization is "not found" in
// another. A session URL redirects to the Sessions list with a notice instead. Pure, so it is unit-tested.
const SESSION = /^\/sessions\/(?!new(?:\/|$))[^/]+/;

export function redirectAfterOrgSwitch(path: string): string | null {
  return SESSION.test(path) ? "/sessions?notice=org-changed" : null;
}
