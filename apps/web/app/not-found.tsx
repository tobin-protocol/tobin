import Link from "next/link";

export const metadata = { title: "Not found" };

/** An address that matches no page. Drawn without the app frame, so it also works signed out. */
export default function NotFound() {
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-[520px] flex-col justify-center gap-4 px-6 py-10">
      <h1 className="text-title font-medium">Page not found</h1>
      <p className="text-body text-muted">There is no page at this address.</p>
      <p><Link href="/discover" className="inline-flex min-h-11 items-center bg-ink px-5 font-label text-[14px] font-medium uppercase tracking-wide text-on-button">Go to Discover</Link></p>
    </main>
  );
}
