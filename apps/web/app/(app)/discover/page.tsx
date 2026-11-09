import { PageFrame } from "../../../components/shell/PageFrame.tsx";
import { ButtonLink } from "../../../components/ui/Button.tsx";
import { NotSupported } from "../../../components/ui/Feedback.tsx";
import { Banner, Card, Panel } from "../../../components/ui/Surfaces.tsx";

export const metadata = { title: "Discover" };

const WOULD_SHOW = [
  "On-chain obligations: identifier, debtor, creditor, asset, amount, session, status and creation time.",
  "On-chain settlements: source, destination, asset, amount, transaction hash, verified status and time.",
  "Search, filters and sorting over public indexed records, and record detail pages with transaction evidence and a Stellar explorer link.",
  "A clear line between information read directly from the chain and information that is indexed or derived.",
];
const NEEDS = [
  "An indexer that reads Tobin's supported Stellar contracts and stores the records.",
  "A public, read-only API over that index, reachable without signing in. Today the console binds to loopback and refuses foreign origins.",
  "A way to verify a settlement on the network and report it. Nothing in Tobin can confirm a settlement today, so a confirmed count cannot exist.",
  "A policy that keeps private organization workspace records out of anything public.",
];

/** A future capability, kept apart from the operational interface (redesign PRD 2.3). No search box, no sample records, nothing that looks like data. */
export default function Page() {
  return (
    <PageFrame title="Discover" breadcrumbs={[{ label: "Discover" }]}>
      <div className="max-w-3xl space-y-4">
        <Banner role="note" className="rounded-card">Future capability. Discover is not available in this application and is not part of the operational workspace.</Banner>
        <NotSupported feature="Public on-chain explorer" reason="Discover would let anyone explore obligations and settlements recorded on Stellar through Tobin's contracts. The backend has no indexer and no public read API, so there is nothing to search or show, and no sample records are displayed." />
        <Panel className="space-y-4">
          <Card>
            <h2 className="text-entity font-medium">What Discover is meant to show</h2>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-body">{WOULD_SHOW.map((t) => <li key={t}>{t}</li>)}</ul>
          </Card>
          <Card>
            <h2 className="text-entity font-medium">What it needs before it can exist</h2>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-body">{NEEDS.map((t) => <li key={t}>{t}</li>)}</ul>
          </Card>
          <Card>
            <h2 className="text-entity font-medium">In the meantime</h2>
            <p className="mt-1 text-body text-muted">Everything in Tobin today is an application record for your organization on Stellar Testnet. None of it is an on-chain record.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <ButtonLink href="/obligations" variant="quiet">Your obligations</ButtonLink>
              <ButtonLink href="/activity" variant="quiet">Your activity</ButtonLink>
              <ButtonLink href="/approvals" variant="quiet">Approvals</ButtonLink>
            </div>
          </Card>
        </Panel>
      </div>
    </PageFrame>
  );
}
