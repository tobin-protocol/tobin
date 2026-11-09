import { headers } from "next/headers";
import Link from "next/link";
import { Suspense } from "react";
import { ClearingExample } from "../../../components/discover/ClearingExample.tsx";
import { Explorer } from "../../../components/discover/Explorer.tsx";
import { PageFrame } from "../../../components/shell/PageFrame.tsx";
import { Button } from "@/components/kit/button";

export const metadata = { title: "Discover" };

/** The public explorer. It reads the public Discover API (GET /api/public/v1/*) through a typed client (lib/discover). Nothing is sample data; the one place illustrative numbers appear is the collapsed example below. */
export default async function DiscoverPage() {
  const signedIn = (await headers()).get("x-tobin-auth") === "in";
  return (
    <PageFrame
      title="Discover"
      actions={signedIn ? <Button asChild><Link href="/">Go to Overview</Link></Button> : undefined}
    >
      <div className="max-w-5xl space-y-8">
        <section aria-labelledby="what-h" className="border border-divider p-5">
          <h2 id="what-h" className="text-entity font-medium">What Tobin is</h2>
          <p className="mt-2 max-w-prose text-body">Tobin is a proposed open, non-custodial clearing protocol for financial institutions on Stellar. Institutions record the payments they owe each other, a deterministic calculation nets them, the participants review the result, and only the net positions are settled.</p>
          <p className="mt-3 inline-block bg-tile px-3 py-1.5 font-label text-label uppercase tracking-wider">Specification and testnet validation stage. Experimental. Test assets only. Not audited.</p>
        </section>

        <Suspense fallback={<div aria-busy="true" className="h-40 bg-tile" />}>
          <Explorer />
        </Suspense>

        <details className="group border border-divider">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 text-entity font-medium">
            <span>How clearing works</span>
            <span className="font-label text-label uppercase tracking-wider text-muted group-open:hidden">Show</span>
            <span className="hidden font-label text-label uppercase tracking-wider text-muted group-open:inline">Hide</span>
          </summary>
          <div className="border-t border-divider p-4"><ClearingExample /></div>
        </details>
      </div>
    </PageFrame>
  );
}
