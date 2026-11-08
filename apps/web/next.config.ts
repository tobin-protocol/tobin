import type { NextConfig } from "next";

// Same Tailwind v4 wiring as apps/landing and apps/docs: the Turbopack loader handles every CSS file.
const nextConfig: NextConfig = {
  reactStrictMode: true,
  turbopack: {
    rules: {
      "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" },
    },
  },
};

export default nextConfig;
