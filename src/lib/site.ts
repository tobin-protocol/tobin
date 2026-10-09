/**
 * External destinations.
 *
 * These are intentionally `null`: no repository or documentation URL exists in
 * this project yet, and none are invented. Set them here and every place that
 * renders a link (navigation, hero, final call to action, footer) picks them up.
 * Until then, links are omitted or shown as clearly marked placeholders.
 */
export const links: { github: string | null; docs: string | null } = {
  github: null, // TODO: Tobin GitHub repository URL
  docs: null, // TODO: Tobin protocol documentation URL
};

export const navLinks = [
  { href: "#protocol", label: "Protocol" },
  { href: "#how-it-works", label: "How It Works" },
  { href: "#stellar", label: "Stellar" },
] as const;

export const siteDescription =
  "Tobin is an open clearing protocol that helps financial institutions net payment obligations and settle the resulting balances on Stellar.";
