/**
 * External destinations.
 *
 * `github` is the public protocol repository. `docs` is intentionally `null`: no
 * hosted documentation site exists yet, and none is invented. Set it here and every
 * place that renders a link (navigation, hero, final call to action, footer) picks it
 * up. Until then, the docs link is omitted or shown as a clearly marked placeholder.
 */
export const links: { github: string | null; docs: string | null } = {
  github: "https://github.com/tobin-protocol/tobin",
  docs: null, // TODO: Tobin documentation site URL (none exists yet)
};

/** Files in the protocol repository. Every path here exists on main. */
const BLOB = "https://github.com/tobin-protocol/tobin/blob/main/";

export type SourceCard = {
  path: string;
  title: string;
  body: string;
  href: string;
  /** Short kind shown in the card meta line. */
  kind: string;
};

export const sourceCards: SourceCard[] = [
  {
    path: "README.md",
    title: "Protocol overview",
    body: "The problem, the proposed approach, what exists today and the planned milestones.",
    href: `${BLOB}README.md`,
    kind: "Overview",
  },
  {
    path: "contracts/README.md",
    title: "MVP-1 Soroban contracts",
    body: "Layout, implemented behaviour and test commands for the experimental contracts.",
    href: `${BLOB}contracts/README.md`,
    kind: "Contracts",
  },
  {
    path: "packages/mvp1-sdk/README.md",
    title: "Netting engine and SDK",
    body: "The MVP-1 TypeScript engine, SDK and local bridge client.",
    href: `${BLOB}packages/mvp1-sdk/README.md`,
    kind: "SDK and engine",
  },
  {
    path: "docs/spec/MVP-1 Implementation Specification — Draft 0.1.md",
    title: "Draft specification",
    body: "The draft implementation specification for the experimental MVP-1.",
    href: `${BLOB}docs/spec/MVP-1%20Implementation%20Specification%20%E2%80%94%20Draft%200.1.md`,
    kind: "Specification (draft)",
  },
  {
    path: "docs/reference/MVP-1-ABI-AND-AUTHORIZATION-REFERENCE.md",
    title: "ABI and authorization reference",
    body: "Who must authorize what, call by call, in MVP-1.",
    href: `${BLOB}docs/reference/MVP-1-ABI-AND-AUTHORIZATION-REFERENCE.md`,
    kind: "Reference",
  },
  {
    path: "SECURITY.md",
    title: "Security policy",
    body: "How to report a vulnerability.",
    href: `${BLOB}SECURITY.md`,
    kind: "Security policy",
  },
  {
    path: "CONTRIBUTING.md",
    title: "Contributing",
    body: "How to give feedback or propose a change.",
    href: `${BLOB}CONTRIBUTING.md`,
    kind: "Contributing",
  },
];

export const repoLinks = {
  readme: `${BLOB}README.md`,
  contracts: `${BLOB}contracts/README.md`,
  spec: sourceCards[3].href,
  contributing: `${BLOB}CONTRIBUTING.md`,
  security: `${BLOB}SECURITY.md`,
  licence: `${BLOB}LICENSE`,
  notice: "https://github.com/tobin-protocol/tobin/blob/main/apps/landing/NOTICE",
} as const;

export const navLinks = [
  { href: "#protocol", label: "Protocol" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#stellar", label: "Stellar" },
  { href: "#status", label: "Status" },
] as const;

export const siteDescription =
  "Tobin is an open clearing protocol that helps financial institutions net payment obligations and settle the resulting balances on Stellar.";

/** The description for search results and social cards: the mission sentence plus the honest status. */
export const metaDescription = `${siteDescription} Experimental: MVP-1 runs on the Stellar testnet and is not production-ready.`;

export const statusLine =
  "Introducing Tobin MVP-1: Experimental clearing infrastructure on the Stellar testnet.";
