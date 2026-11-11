/**
 * External destinations.
 *
 * `github` is the public protocol repository. `docs` is the documentation site (apps/docs,
 * its own Vercel project). Every place that renders a link (navigation, final call to action,
 * footer) reads it from here, so changing it here changes them all.
 */
export const links: { github: string | null; docs: string | null; app: string | null } = {
  github: "https://github.com/tobin-protocol/tobin",
  docs: "https://docs.tobinprotocol.xyz",
  /**
   * The web application (apps/web). In a production build this is null unless NEXT_PUBLIC_TOBIN_APP_URL is set (the hosted app's address),
   * and the navigation then shows a disabled "Launch app (soon)". In development it points at the local app.
   */
  app: process.env.NEXT_PUBLIC_TOBIN_APP_URL ?? (process.env.NODE_ENV === "production" ? null : "http://127.0.0.1:3000"),
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
    body: "The problem, the workflow, the current status and what is not yet built.",
    href: `${BLOB}README.md`,
    kind: "Overview",
  },
  {
    path: "contracts/README.md",
    title: "MVP-1 Soroban contracts",
    body: "Layout, implemented behaviour and test commands for the contracts.",
    href: `${BLOB}contracts/README.md`,
    kind: "Contracts",
  },
  {
    path: "packages/mvp1-sdk/README.md",
    title: "Netting engine and digest library",
    body: "The MVP-1 TypeScript netting engine, digest encoding and local bridge client. Not published to npm.",
    href: `${BLOB}packages/mvp1-sdk/README.md`,
    kind: "Engine library",
  },
  {
    path: "TECHNICAL.md",
    title: "Technical overview",
    body: "How the application, backend and contracts fit together, with the status of each part.",
    href: `${BLOB}TECHNICAL.md`,
    kind: "Technical overview",
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
    path: "docs/scf/implementation/testnet-engineering-evidence.md",
    title: "Testnet evidence",
    body: "The eight Testnet transactions, what they show and what they do not.",
    href: `${BLOB}docs/scf/implementation/testnet-engineering-evidence.md`,
    kind: "Evidence",
  },
];

export const repoLinks = {
  readme: `${BLOB}README.md`,
  contracts: `${BLOB}contracts/README.md`,
  spec: `${BLOB}docs/spec/MVP-1%20Implementation%20Specification%20%E2%80%94%20Draft%200.1.md`,
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
  "Tobin is institutional clearing and settlement infrastructure built on Stellar. It lets financial institutions record obligations, calculate net positions, apply authorization controls and settle only the net balances through Stellar.";

/** The description for search results and social cards: the mission sentence plus the honest status. */
export const metaDescription = `${siteDescription} Demonstrated on the Stellar testnet; production deployment has not yet been approved.`;

export const statusLine =
  "Institutional clearing and settlement infrastructure on Stellar, demonstrated on Testnet. Production deployment not yet approved.";
