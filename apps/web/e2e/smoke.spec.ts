import { expect, test } from "@playwright/test";

// Smoke tests that need NO backend: they cover pages reachable signed out and the component gallery.
// (When the console backend is not running, the proxy answers 503 and the app treats the user as signed out.)

test("the component gallery renders every section", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("/dev/components");
  await expect(page.getByRole("heading", { name: "Component gallery" })).toBeVisible();
  for (const h of ["Buttons", "Surfaces and figures", "Form fields", "Status marks", "Tables, tabs, identifiers and avatars", "Dialog, side panel, popover, command panel"]) {
    await expect(page.getByRole("heading", { name: h })).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test("the stage rail never fills the last stage without a verified read-back", async ({ page }) => {
  await page.goto("/dev/components");
  const rail = page.getByRole("list", { name: "Transaction stages" });
  await page.getByLabel("Backend state").selectOption("confirmed");
  await expect(page.getByText("Submitted, awaiting verification")).toBeVisible();
  await page.getByLabel(/Verified read-back/).check();
  await expect(page.getByText("Independently verified")).toBeVisible();
  await page.getByLabel(/Verified read-back/).uncheck();
  await expect(rail).toBeVisible();
  await expect(page.getByText("Submitted, awaiting verification")).toBeVisible();
});

test("signed out, the root lands on Discover and a protected route goes to sign-in with a return path", async ({ page }) => {
  await page.goto("/");
  await page.waitForURL(/\/discover$/);
  await expect(page.getByRole("heading", { name: "Discover", level: 1 })).toBeVisible();
  await expect(page.getByText("Illustrative example. Not live data.")).toBeVisible();
  await page.goto("/obligations");
  await page.waitForURL(/\/sign-in\?next=%2Fobligations/);
  await expect(page.getByRole("heading", { name: "Sign in to Tobin" })).toBeVisible();
  await expect(page.getByText("Stellar Testnet").first()).toBeVisible();
});

test("a protected route answers with a redirect and no protected markup", async ({ request }) => {
  const r = await request.get("/sessions", { maxRedirects: 0 });
  expect(r.status()).toBe(307);
  expect(r.headers()["location"]).toContain("/sign-in?next=%2Fsessions");
  expect(await r.text()).not.toContain("Clearing");
});

test("wallet sign-in reports a missing Freighter plainly, inline", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByRole("button", { name: "Sign in with wallet" }).click();
  await expect(page.getByText("Freighter not found")).toBeVisible();
  await expect(page.getByText(/Install the Freighter extension/)).toBeVisible();
});

test("the proxy refuses routes it must not forward", async ({ request }) => {
  for (const p of ["/api/stellar/run", "/api/rpc", "/api/bootstrap", "/api/health"]) {
    const r = await request.get(p);
    expect(r.status(), p).toBe(404);
  }
});
