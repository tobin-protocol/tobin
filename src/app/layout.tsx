import type { Metadata, Viewport } from "next";
import { JetBrains_Mono } from "next/font/google";
import { MotionProvider } from "@/components/MotionProvider";
import { SmoothScroll } from "@/components/SmoothScroll";
import { siteDescription } from "@/lib/site";
import "./globals.css";

// Labels and technical text. The variable is not named --font-mono because that is
// the Tailwind theme token this feeds (see globals.css), which would be circular.
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-jetbrains-mono",
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
  themeColor: "#0B0B0F",
  colorScheme: "light",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`h-full ${jetbrainsMono.variable}`}>
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
