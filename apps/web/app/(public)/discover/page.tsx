import { headers } from "next/headers";
import Link from "next/link";
import { ClearingExample } from "../../../components/discover/ClearingExample.tsx";
import { PageFrame } from "../../../components/shell/PageFrame.tsx";
import { NotSupportedCard } from "../../../components/tobin/NotSupportedCard.tsx";
import { Button } from "@/components/kit/button";

export const metadata = { title: "Discover" };

/** The only page a signed-out visitor can use. Honest content only: an explanation, a labelled illustration, the network, and three capabilities that do not exist yet. */
export default async function DiscoverPage() {
  const signedIn = (await headers()).get("x-tobin-auth") === "in";
  return (
    <PageFrame
      title="Discover"
      actions={signedIn ? <Button asChild><Link href="/">Go to Overview</Link></Button> : <Button asChild><Link href="/sign-in">Connect wallet</Link></Button>}
    >
      <div className="max-w-5xl space-y-8">
        <section aria-labelledby="what-h" className="border border-divider p-5">
          <h2 id="what-h" className="text-entity font-medium">What Tobin is</h2>
          <p className="mt-2 max-w-prose text-body">Tobin is a proposed open, non-custodial clearing protocol for financial institutions on Stellar. Institutions record the payments they owe each other, a deterministic calculation nets them, the participants review the result, and only the net positions are settled.</p>
          <p className="mt-3 inline-block bg-tile px-3 py-1.5 font-label text-label uppercase tracking-wider">Specification and testnet validation stage. Experimental. Test assets only. Not audited.</p>
        </section>

        <section aria-labelledby="how-h" className="space-y-3">
          <h2 id="how-h" className="text-entity font-medium">How clearing works</h2>
          <ClearingExample />
        </section>

        <section aria-labelledby="net-h" className="border border-divider p-5">
          <h2 id="net-h" className="text-entity font-medium">Network</h2>
          <p className="mt-2 text-body"><span className="font-label uppercase tracking-wider">Stellar Testnet.</span> <span className="text-muted">Nothing here moves real funds, and there is no Mainnet state. No live status is shown because there is no public status endpoint.</span></p>
        </section>

        <div className="grid gap-4 md:grid-cols-3">
          <NotSupportedCard id="ns-sessions" title="Public sessions">A list of clearing sessions anyone could browse. There is no public read API, so no session can be shown.</NotSupportedCard>
          <NotSupportedCard id="ns-institutions" title="Institutions">A directory of participating institutions. Organization records are private to their members and the backend has no public directory.</NotSupportedCard>
          <NotSupportedCard id="ns-assets" title="Supported assets">The assets that sessions can name. The list the console keeps is private to signed-in accounts and says nothing about availability on the network.</NotSupportedCard>
        </div>

        <section aria-labelledby="cta-h" className="flex flex-wrap items-center justify-between gap-4 border border-divider p-5">
          <div>
            <h2 id="cta-h" className="text-entity font-medium">Take part</h2>
            <p className="mt-1 text-body text-muted">Connect a wallet to open the workspace, or read how the protocol works first.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline"><a href="https://docs.tobinprotocol.xyz" target="_blank" rel="noreferrer noopener">Documentation<span className="sr-only"> (opens in a new tab)</span></a></Button>
            {signedIn ? null : <Button asChild><Link href="/sign-in">Connect wallet</Link></Button>}
          </div>
        </section>
      </div>
    </PageFrame>
  );
}
