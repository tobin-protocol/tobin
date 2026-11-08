import type { Metadata } from "next";
import { Instrument_Sans, Outfit, Space_Grotesk, Urbanist } from "next/font/google";
import { RootProvider } from "fumadocs-ui/provider/next";
import type { ReactNode } from "react";
import { DOCS_URL } from "@/lib/site";
import "./global.css";

// The same four faces as the landing page, each with one job: Urbanist headings, Outfit display,
// Instrument Sans body and UI, Space Grotesk labels.
const urbanist = Urbanist({ subsets: ["latin"], variable: "--font-urbanist", display: "swap" });
const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit", display: "swap" });
const instrumentSans = Instrument_Sans({ subsets: ["latin"], variable: "--font-instrument-sans", display: "swap" });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-space-grotesk", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(DOCS_URL),
  title: { default: "Tobin Developer Documentation", template: "%s · Tobin Docs" },
  description:
    "Developer documentation for Tobin: institutional clearing and settlement infrastructure built on Stellar. Implemented and demonstrated on Stellar Testnet; production deployment has not yet been approved.",
};

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${urbanist.variable} ${outfit.variable} ${instrumentSans.variable} ${spaceGrotesk.variable}`}
      suppressHydrationWarning
    >
      <body className="flex min-h-screen flex-col">
        <RootProvider search={{ options: { api: "/api/search" } }}>{children}</RootProvider>
      </body>
    </html>
  );
}
