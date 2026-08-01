import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { bills, lineItems } from "@/lib/db/schema";
import { newSlug } from "@/lib/bills";

export const runtime = "nodejs";

/**
 * Creates a bill directly, so end-to-end tests don't have to spend an API call
 * on OCR to get to the screens they're actually testing.
 *
 * Gated behind an explicit env flag rather than NODE_ENV: the e2e suite runs a
 * production build, so a NODE_ENV check would either disable the route there or
 * leave it exposed on a real deployment. The flag is set only by
 * playwright.config.ts.
 */
const enabled = () => process.env.ENABLE_TEST_ROUTES === "1";

const bodySchema = z.object({
  merchant: z.string().default("Test Receipt"),
  items: z
    .array(
      z.object({
        description: z.string(),
        totalCents: z.number().int(),
        quantity: z.number().int().min(1).default(1),
        category: z.enum(["item", "discount", "fee"]).default("item"),
      }),
    )
    .min(1),
  taxCents: z.number().int().default(0),
  tipCents: z.number().int().default(0),
});

export async function POST(request: Request) {
  if (!enabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid seed payload." }, { status: 400 });
  }

  const { merchant, items, taxCents, tipCents } = parsed.data;
  const subtotal = items.reduce((sum, item) => sum + item.totalCents, 0);
  const slug = newSlug();

  const [bill] = await db
    .insert(bills)
    .values({
      slug,
      merchant,
      purchasedAt: new Date(),
      subtotalCents: subtotal,
      taxCents,
      tipCents,
      totalCents: subtotal + taxCents + tipCents,
      ocrStatus: "done",
      ocrConfidence: "high",
    })
    .returning();

  if (!bill) {
    return NextResponse.json({ error: "Seed failed." }, { status: 500 });
  }

  await db.insert(lineItems).values(
    items.map((item, position) => ({
      billId: bill.id,
      position,
      description: item.description,
      quantity: item.quantity,
      unitPriceCents: Math.round(item.totalCents / item.quantity),
      totalCents: item.totalCents,
      category: item.category,
    })),
  );

  return NextResponse.json({ slug }, { status: 201 });
}
