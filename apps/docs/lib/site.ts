// The single place for external URLs used by this app. Owner decisions (2026-11): the canonical website is
// https://tobinprotocol.xyz and the documentation site is https://docs.tobinprotocol.xyz. They are
// constants, not environment variables, so a preview build cannot silently point production links elsewhere.
// Only public, real URLs belong here: no invented social or contact links.
export const DOCS_URL = "https://docs.tobinprotocol.xyz";
export const LANDING_URL = "https://tobinprotocol.xyz";
export const REPO = "https://github.com/tobin-protocol/tobin";
export const REPO_BLOB = `${REPO}/blob/main`;
export const REPO_TREE = `${REPO}/tree/main`;

export const links = {
  contributing: `${REPO_BLOB}/CONTRIBUTING.md`,
  security: `${REPO_BLOB}/SECURITY.md`,
  conduct: `${REPO_BLOB}/CODE_OF_CONDUCT.md`,
  license: `${REPO_BLOB}/LICENSE`,
  agents: `${REPO_BLOB}/AGENTS.md`,
} as const;
