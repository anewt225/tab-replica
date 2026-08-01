import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { bills, lineItems } from "@/lib/db/schema";
import { bumpVersion } from "@/lib/bills";

export const runtime = "nodejs";

const itemSchema = z.object({
  id: z.uuid().optional(), // absent = a new line the reviewer added by hand
  description: z.string().trim().min(1).max(300),
  quantity: z.number().int().min(1).max(999),
  unitPriceCents: z.number().int().min(-10_000_000).max(10_000_000),
  totalCents: z.number().int().min(-10_000_000).max(10_000_000),
  category: z.enum(["item", "discount", "fee"]),
});

const bodySchema = z.object({ items: z.array(itemSchema).max(300) });

/**
 * Replace the bill's line items wholesale. The review screen submits the full
 * list, which keeps ordering and deletions trivially correct — reconciling a
 * partial diff against OCR output would be a lot of complexity for no gain.
 *
 * Claims cascade-delete with their line item, so an edit that removes a line
 * also removes anyone's claim on it. That is the right behaviour: the line is
 * gone, and the alternative is a claim pointing at nothing.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid line items.", issues: z.treeifyError(parsed.error) },
      { status: 400 },
    );
  }

  const bill = await db.query.bills.findFirst({ where: eq(bills.slug, slug) });
  if (!bill) return NextResponse.json({ error: "Bill not found." }, { status: 404 });
  if (bill.finalizedAt) {
    return NextResponse.json(
      { error: "This bill is finalized. Reopen it before editing items." },
      { status: 409 },
    );
  }

  const incoming = parsed.data.items;
  const keepIds = new Set(incoming.map((i) => i.id).filter(Boolean) as string[]);

  await db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: lineItems.id })
      .from(lineItems)
      .where(eq(lineItems.billId, bill.id));

    for (const row of existing) {
      if (!keepIds.has(row.id)) {
        await tx.delete(lineItems).where(eq(lineItems.id, row.id));
      }
    }

    for (const [position, item] of incoming.entries()) {
      const values = {
        billId: bill.id,
        position,
        description: item.description,
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents,
        totalCents: item.totalCents,
        category: item.category,
      };
      if (item.id) {
        await tx
          .update(lineItems)
          .set(values)
          .where(and(eq(lineItems.id, item.id), eq(lineItems.billId, bill.id)));
      } else {
        await tx.insert(lineItems).values(values);
      }
    }

    const subtotal = incoming.reduce((sum, i) => sum + i.totalCents, 0);
    await tx.update(bills).set({ subtotalCents: subtotal }).where(eq(bills.id, bill.id));
  });

  const version = await bumpVersion(bill.id);
  return NextResponse.json({ ok: true, version });
}
