import type { Metadata, Viewport } from "next";
import { Instrument_Sans, JetBrains_Mono } from "next/font/google";
import { MotionProvider } from "@/components/MotionProvider";
import { SmoothScroll } from "@/components/SmoothScroll";
import { siteDescription } from "@/lib/site";
import "./globals.css";

// Wordmark, headings, labels and code. Variable font, so every weight is available.
// The CSS variable is not named --font-mono because that is the Tailwind theme token
// this feeds (see globals.css), which would be circular.
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

// Body text and UI. Same naming rule as above.
const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-instrument-sans",
  display: "swap",
});

const title = "Tobin Clearing Protocol";

// Set NEXT_PUBLIC_SITE_URL at deploy time so social images resolve to absolute URLs.
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;

export const metadata: Metadata = {
  metadataBase: siteUrl ? new URL(siteUrl) : undefined,
  title: { default: title, template: "%s · tobin" },
  description: siteDescription,
  applicationName: "Tobin",
  manifest: "/site.webmanifest",
  // og:image / twitter:image come from app/opengraph-image.png and app/twitter-image.png.
  openGraph: {
    type: "website",
    siteName: "Tobin Clearing Protocol",
    title,
    description: siteDescription,
  },
  twitter: {
    card: "summary_large_image",
    title,
    description: siteDescription,
  },
};

export const viewport: Viewport = {
  themeColor: "#0D1838",
  colorScheme: "light",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`h-full ${jetbrainsMono.variable} ${instrumentSans.variable}`}>
      <head>
        {/* Scroll reveals start hidden; without JS, show everything. */}
        <noscript>
          <style>{`[style*="opacity: 0"],[style*="opacity:0"]{opacity:1!important;transform:none!important}[style*="clip-path"]{clip-path:none!important}`}</style>
        </noscript>
      </head>
      <body className="flex min-h-full flex-col">
        <SmoothScroll />
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}
