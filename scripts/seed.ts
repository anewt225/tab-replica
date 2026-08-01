/**
 * Insert a realistic bill so the claim and summary screens can be exercised
 * without spending an API call on OCR. Prints the URL to open.
 *
 *     pnpm db:seed
 */
import { db } from "../lib/db/client";
import { bills, lineItems } from "../lib/db/schema";
import { newSlug } from "../lib/bills";
import { formatCents } from "../lib/money";

const ITEMS = [
  { description: "Burrata & peaches", quantity: 1, totalCents: 1600, category: "item" },
  { description: "Wood-fired focaccia", quantity: 1, totalCents: 900, category: "item" },
  { description: "Cacio e pepe", quantity: 1, totalCents: 2400, category: "item" },
  { description: "Bistecca, 32oz", quantity: 1, totalCents: 8800, category: "item" },
  { description: "Bucatini alle vongole", quantity: 1, totalCents: 2900, category: "item" },
  { description: "Negroni", quantity: 3, totalCents: 5400, category: "item" },
  { description: "Barolo, glass", quantity: 2, totalCents: 3600, category: "item" },
  { description: "Tiramisu", quantity: 1, totalCents: 1400, category: "item" },
  { description: "Restaurant week promo", quantity: 1, totalCents: -2000, category: "discount" },
  { description: "Kitchen service charge", quantity: 1, totalCents: 1250, category: "fee" },
] as const;

const subtotal = ITEMS.reduce((sum, item) => sum + item.totalCents, 0);
const taxCents = 2280;
const tipCents = 5150;

const slug = newSlug();

const [bill] = await db
  .insert(bills)
  .values({
    slug,
    merchant: "Trattoria Nove",
    purchasedAt: new Date(),
    currency: "USD",
    subtotalCents: subtotal,
    taxCents,
    tipCents,
    totalCents: subtotal + taxCents + tipCents,
    ocrStatus: "done",
    ocrConfidence: "high",
  })
  .returning();

if (!bill) {
  console.error("Seed failed: no bill was created.");
  process.exit(1);
}

await db.insert(lineItems).values(
  ITEMS.map((item, position) => ({
    billId: bill.id,
    position,
    description: item.description,
    quantity: item.quantity,
    unitPriceCents: Math.round(item.totalCents / item.quantity),
    totalCents: item.totalCents,
    category: item.category,
  })),
);

console.log(`Seeded "${bill.merchant}" — ${formatCents(bill.totalCents)}`);
console.log(`  http://localhost:3000/bill/${slug}`);
process.exit(0);
