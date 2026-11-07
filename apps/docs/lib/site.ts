// External links used by the header, footer and homepage. Only URLs that exist and are public are
// listed. The website URL is the one named in the repository README; deployments may override it with
// NEXT_PUBLIC_LANDING_URL.
export const REPO = "https://github.com/tobin-protocol/tobin";
export const REPO_BLOB = `${REPO}/blob/main`;
export const REPO_TREE = `${REPO}/tree/main`;
export const LANDING_URL = process.env.NEXT_PUBLIC_LANDING_URL?.trim() || "https://tobinprotocol.xyz";

export const links = {
  contributing: `${REPO_BLOB}/CONTRIBUTING.md`,
  security: `${REPO_BLOB}/SECURITY.md`,
  conduct: `${REPO_BLOB}/CODE_OF_CONDUCT.md`,
  license: `${REPO_BLOB}/LICENSE`,
  agents: `${REPO_BLOB}/AGENTS.md`,
} as const;
