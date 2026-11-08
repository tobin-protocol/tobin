import { defineConfig } from "@playwright/test";

// Smoke tests run against `next start` on port 3100 with the system Chrome (no browser download). They do not need the console backend:
// they cover pages that are reachable signed out and the component gallery.
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:3100", channel: "chrome" },
  webServer: {
    command: "npm run build && npx next start --hostname 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100/sign-in",
    reuseExistingServer: true,
    timeout: 240_000,
  },
});
