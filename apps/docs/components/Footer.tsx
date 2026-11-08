import { Brand } from "@/components/BrandMark";
import { LANDING_URL, REPO, links } from "@/lib/site";

const items: { label: string; href: string }[] = [
  ...(LANDING_URL ? [{ label: "Main website", href: LANDING_URL }] : []),
  { label: "GitHub", href: REPO },
  { label: "Contribution guide", href: links.contributing },
  { label: "Security policy", href: links.security },
  { label: "Licence", href: links.license },
];

export function Footer() {
  return (
    <footer className="border-t border-fd-border">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-6 px-4 py-10 md:flex-row md:items-start md:justify-between md:px-6">
        <div className="max-w-sm">
          <Brand />
          <p className="mt-3 text-sm text-fd-muted-foreground">
            Pre-production institutional infrastructure on Stellar Testnet. Production deployment has not yet been approved; Mainnet and real-value use are not
            authorised. The Tobin name and logo are not covered by the Apache-2.0 licence.
          </p>
        </div>
        <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          {items.map((i) => (
            <li key={i.label}>
              <a
                href={i.href}
                className="text-fd-muted-foreground underline decoration-1 underline-offset-4 transition-colors hover:text-fd-foreground"
              >
                {i.label}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </footer>
  );
}
