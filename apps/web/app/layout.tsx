import type { Metadata, Viewport } from "next";
import { Instrument_Sans, Outfit, Space_Grotesk, Urbanist } from "next/font/google";
import type { ReactNode } from "react";
import { Providers } from "../components/Providers.tsx";
import "./globals.css";

// The landing page's four faces (apps/landing/src/app/layout.tsx), loaded the same way: Urbanist for headings, Outfit for display numerals and the banner
// headline, Instrument Sans for the interface, Space Grotesk for labels. Identifiers use the system monospace stack, as on the landing page. No other face.
const urbanist = Urbanist({ subsets: ["latin"], variable: "--font-urbanist", display: "swap" });
const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit", display: "swap" });
const instrumentSans = Instrument_Sans({ subsets: ["latin"], variable: "--font-instrument-sans", display: "swap" });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-space-grotesk", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Tobin", template: "%s · Tobin" },
  description: "The Tobin web application. Stellar Testnet only; local hosting only.",
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${urbanist.variable} ${outfit.variable} ${instrumentSans.variable} ${spaceGrotesk.variable}`}>
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:bg-button focus:px-3 focus:py-2 focus:text-on-button">Skip to content</a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
