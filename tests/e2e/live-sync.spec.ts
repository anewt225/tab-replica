import { test, expect, type Page, type BrowserContext } from "@playwright/test";

/**
 * Two phones, one bill.
 *
 * This is the claim the whole live-sync design rests on, so it gets tested with
 * two genuinely separate browser contexts — separate cookie jars, therefore
 * separate device identities, exactly like two people at a table.
 */

const SEED = {
  merchant: "Playwright Diner",
  items: [
    { description: "Steak", totalCents: 4000 },
    { description: "Salad", totalCents: 800 },
    { description: "Shared fries", totalCents: 600 },
  ],
  taxCents: 480,
  tipCents: 960,
};

async function createBill(page: Page): Promise<string> {
  const response = await page.request.post("/api/test/seed", { data: SEED });
  expect(response.ok(), "seed endpoint should be available in test mode").toBeTruthy();
  const { slug } = await response.json();
  return slug;
}

async function join(context: BrowserContext, slug: string, name: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`/bill/${slug}`);
  await page.getByPlaceholder("Your name").fill(name);
  await page.getByRole("button", { name: /start claiming/i }).click();
  await expect(page.getByRole("button", { name: /Steak/ })).toBeVisible();
  return page;
}

test("two people claim items and each sees the other's choices", async ({ browser }) => {
  const alexContext = await browser.newContext();
  const baileyContext = await browser.newContext();

  const setup = await alexContext.newPage();
  const slug = await createBill(setup);
  await setup.close();

  const alex = await join(alexContext, slug, "Alex");
  const bailey = await join(baileyContext, slug, "Bailey");

  // Alex's phone should learn about Bailey without a reload.
  await expect(alex.getByLabel("Bailey")).toBeVisible({ timeout: 15_000 });

  // Alex takes the steak. He's the only claimant so far, so tax and tip are
  // entirely his: 40.00 + 4.80 + 9.60 = 54.40.
  await alex.getByRole("button", { name: /Steak/ }).click();
  await expect(alex.getByText("$54.40")).toBeVisible();

  // Bailey's phone picks it up via polling — no reload, no refresh button.
  await expect(
    bailey.getByRole("button", { name: /Steak/ }).getByLabel("Alex"),
  ).toBeVisible({ timeout: 15_000 });

  // Bailey takes the salad.
  await bailey.getByRole("button", { name: /Salad/ }).click();
  await expect(
    alex.getByRole("button", { name: /Salad/ }).getByLabel("Bailey"),
  ).toBeVisible({ timeout: 15_000 });

  // Both claim the fries — a shared item splits down the middle.
  await alex.getByRole("button", { name: /Shared fries/ }).click();
  await bailey.getByRole("button", { name: /Shared fries/ }).click();
  await expect(alex.getByText("split 2 ways")).toBeVisible({ timeout: 15_000 });

  // Everything is claimed now. Alex has steak 40.00 + half the fries 3.00 =
  // 43.00 of the 54.00 of food, so 43/54 of tax (3.82) and tip (7.64) → 54.46.
  // Bailey has salad 8.00 + fries 3.00 + 0.98 tax + 1.96 tip → 13.94.
  await expect(alex.getByText("$54.46")).toBeVisible({ timeout: 15_000 });
  await expect(bailey.getByText("$13.94")).toBeVisible({ timeout: 15_000 });

  // Every cent lands on somebody: 8.00 + 3.00 of items, plus the rest of tax/tip.
  await alex.goto(`/bill/${slug}/summary`);
  await expect(alex.getByText("Every cent accounted for.")).toBeVisible();

  await alexContext.close();
  await baileyContext.close();
});

test("an unclaimed item is called out rather than quietly absorbed", async ({
  browser,
}) => {
  const context = await browser.newContext();
  const setup = await context.newPage();
  const slug = await createBill(setup);
  await setup.close();

  const page = await join(context, slug, "Casey");
  await page.getByRole("button", { name: /Steak/ }).click();

  await expect(page.getByText(/items haven't been claimed/i)).toBeVisible({
    timeout: 15_000,
  });

  await context.close();
});
