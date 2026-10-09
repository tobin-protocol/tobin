import type { Metadata, Viewport } from "next";
import { MotionProvider } from "@/components/MotionProvider";
import { SmoothScroll } from "@/components/SmoothScroll";
import { siteDescription } from "@/lib/site";
import "./globals.css";

const title = "Tobin Clearing Protocol: Clear more. Settle less.";

// Set NEXT_PUBLIC_SITE_URL at deploy time so social images resolve to absolute URLs.
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;

export const metadata: Metadata = {
  metadataBase: siteUrl ? new URL(siteUrl) : undefined,
  title,
  description: siteDescription,
  applicationName: "Tobin",
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
  themeColor: "#f6f4ee",
  colorScheme: "light",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full">
      <head>
        {/* Scroll reveals start hidden; without JS, show everything. */}
        <noscript>
          <style>{`[style*="opacity: 0"],[style*="opacity:0"]{opacity:1!important;transform:none!important}`}</style>
        </noscript>
      </head>
      <body className="flex min-h-full flex-col">
        <SmoothScroll />
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}
