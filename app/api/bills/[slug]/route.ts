import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { bills } from "@/lib/db/schema";
import {
  bumpVersion,
  findParticipantForDevice,
  getBillBySlug,
  hydrate,
  serializeBill,
} from "@/lib/bills";
import { readDeviceId } from "@/lib/device";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const view = await getBillBySlug(slug);
  if (!view) return NextResponse.json({ error: "Bill not found." }, { status: 404 });

  const deviceId = await readDeviceId();
  const viewer = await findParticipantForDevice(view.bill.id, deviceId);
  return NextResponse.json(serializeBill(view, viewer?.id ?? null));
}

const patchSchema = z.object({
  merchant: z.string().max(200).nullable().optional(),
  taxCents: z.number().int().min(0).max(10_000_000).optional(),
  tipCents: z.number().int().min(0).max(10_000_000).optional(),
  totalCents: z.number().int().min(0).max(100_000_000).optional(),
  payerParticipantId: z.uuid().nullable().optional(),
  finalized: z.boolean().optional(),
});

/** Edits from the review screen, plus finalizing the bill. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request.", issues: z.treeifyError(parsed.error) },
      { status: 400 },
    );
  }

  const bill = await db.query.bills.findFirst({ where: eq(bills.slug, slug) });
  if (!bill) return NextResponse.json({ error: "Bill not found." }, { status: 404 });

  const { finalized, ...fields } = parsed.data;
  const updates: Partial<typeof bills.$inferInsert> = { ...fields };
  if (finalized !== undefined) {
    updates.finalizedAt = finalized ? new Date() : null;
  }

  if (Object.keys(updates).length > 0) {
    await db.update(bills).set(updates).where(eq(bills.id, bill.id));
    await bumpVersion(bill.id);
  }

  const refreshed = await db.query.bills.findFirst({ where: eq(bills.id, bill.id) });
  const view = await hydrate(refreshed!);
  const deviceId = await readDeviceId();
  const viewer = await findParticipantForDevice(bill.id, deviceId);
  return NextResponse.json(serializeBill(view, viewer?.id ?? null));
}
