import { createMDX } from "fumadocs-mdx/next";

// Same Tailwind v4 wiring as apps/landing: the Turbopack loader handles every CSS file.
/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default createMDX()(config);
