import type { ReactNode } from "react";
import { Wordmark } from "../../components/shell/BrandMark.tsx";
import { SampleDataBanner } from "../../components/ui/Surfaces.tsx";
import { SAMPLE_DATA } from "../../lib/tobin/index.ts";

// Signed-out pages: a centred #f0f0f0 panel on the white page. The environment is stated here too, because nothing sensitive happens without it.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      {SAMPLE_DATA ? <SampleDataBanner /> : null}
      <header className="border-b border-divider">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between px-4 sm:px-6">
          <Wordmark />
          <span className="flex h-9 items-center gap-2 rounded-btn bg-ink-5 px-3 text-body font-medium"><span aria-hidden="true" className="size-2 rounded-full border border-ink" />Stellar Testnet</span>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="flex flex-1 items-start justify-center px-4 py-10 outline-none sm:py-16">{children}</main>
      <footer className="px-4 pb-8 text-center text-label text-muted">Testnet. Test assets only. Nothing here moves real funds. Production deployment has not been approved.</footer>
    </div>
  );
}
