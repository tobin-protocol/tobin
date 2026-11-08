import type { Metadata, Viewport } from "next";
import { Geist, JetBrains_Mono } from "next/font/google";
import type { ReactNode } from "react";
import { Providers } from "../components/Providers.tsx";
import "./globals.css";

// Geist stands in for the design spec's Gellix. JetBrains Mono is used only for identifiers, hashes and addresses.
const geist = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Tobin", template: "%s · Tobin" },
  description: "The Tobin web application. Stellar Testnet only; local hosting only.",
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${jetbrains.variable}`}>
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-btn focus:bg-button focus:px-3 focus:py-2 focus:text-on-button">Skip to content</a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
