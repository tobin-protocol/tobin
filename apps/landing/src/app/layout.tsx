import type { Metadata, Viewport } from "next";
import { Instrument_Sans, Outfit, Space_Grotesk, Urbanist } from "next/font/google";
import { MotionProvider } from "@/components/MotionProvider";
import { SmoothScroll } from "@/components/SmoothScroll";
import { metaDescription } from "@/lib/site";
import "./globals.css";

// Four faces, each with one job, all loaded through next/font/google (SIL Open Font License). Variable
// fonts, so every weight is available. The CSS variables are not named --font-sans and so on because
// those are the Tailwind theme tokens they feed (see globals.css), which would be circular. JetBrains
// Mono is deliberately not loaded: its only consumer was the old brand-pack Logo, which nothing renders.
//
// Urbanist: headlines. Outfit: display numerals and the hero headline. Instrument Sans: body
// text, buttons and UI. Space Grotesk: labels, chart axes, repository paths, tags.
const urbanist = Urbanist({ subsets: ["latin"], variable: "--font-urbanist", display: "swap" });
const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit", display: "swap" });
const instrumentSans = Instrument_Sans({ subsets: ["latin"], variable: "--font-instrument-sans", display: "swap" });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-space-grotesk", display: "swap" });

const title = "Tobin Clearing Protocol";

// The absolute origin that social-preview image URLs resolve against. Set NEXT_PUBLIC_SITE_URL to the
// production origin (for example https://example.org, no path) in the deployment environment. On Vercel,
// its own system variables are used as a fallback so a preview or production build still gets absolute URLs.
// With none of them, Next.js falls back to http://localhost:3000 and warns; set TOBIN_REQUIRE_SITE_URL=1 in
// the deployment environment to make that a build error instead of a silent localhost share image.
function resolveSiteUrl(): string | undefined {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit;
  if (process.env.VERCEL_ENV === "production" && process.env.VERCEL_PROJECT_PRODUCTION_URL)
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return undefined;
}
const siteUrl = resolveSiteUrl();
if (!siteUrl && process.env.TOBIN_REQUIRE_SITE_URL === "1") {
  throw new Error("NEXT_PUBLIC_SITE_URL is not set, so Open Graph and Twitter image URLs would point at localhost.");
}

export const metadata: Metadata = {
  metadataBase: siteUrl ? new URL(siteUrl) : undefined,
  title: { default: title, template: "%s · tobin" },
  description: metaDescription,
  applicationName: "Tobin",
  manifest: "/site.webmanifest",
  // og:image / twitter:image come from app/opengraph-image.png and app/twitter-image.png.
  openGraph: {
    type: "website",
    siteName: "Tobin Clearing Protocol",
    title,
    description: metaDescription,
  },
  twitter: {
    card: "summary_large_image",
    title,
    description: metaDescription,
  },
};

export const viewport: Viewport = {
  themeColor: "#08080b",
  colorScheme: "light",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`h-full ${urbanist.variable} ${outfit.variable} ${instrumentSans.variable} ${spaceGrotesk.variable}`}>
      <head>
        {/* Scroll reveals start hidden; without JS, show everything. */}
        <noscript>
          <style>{`[style*="opacity: 0"],[style*="opacity:0"]{opacity:1!important;transform:none!important}[style*="clip-path"]{clip-path:none!important}.odo-strip{transform:translateY(var(--final))!important}.overflow-hidden>.block{transform:none!important;opacity:1!important}`}</style>
        </noscript>
      </head>
      <body className="flex min-h-full flex-col">
        <SmoothScroll />
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}
