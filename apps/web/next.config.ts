import type { NextConfig } from "next";
import { hostedProblems } from "./lib/server/config.ts";
import { HSTS, STATIC_SECURITY_HEADERS } from "./lib/server/headers.ts";

// A hosted build must not carry development switches: NEXT_PUBLIC_* values are baked in at build time, so the build itself refuses them.
const problems = hostedProblems(process.env).filter((p) => /SAMPLE_DATA|DEV_GALLERY/.test(p));
if (problems.length > 0) throw new Error("Tobin web refuses to build in hosted mode:\n - " + problems.join("\n - "));

const hosted = process.env.TOBIN_DEPLOYMENT_MODE === "hosted";

// Same Tailwind v4 wiring as apps/landing and apps/docs: the Turbopack loader handles every CSS file.
const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" },
    },
  },
  // Static security headers for every response (including the API proxy and static files); the nonce-based CSP is added per page request in proxy.ts.
  async headers() {
    return [{ source: "/:path*", headers: [...STATIC_SECURITY_HEADERS, ...(hosted ? [HSTS] : [])].map((h) => ({ ...h })) }];
  },
};

export default nextConfig;
