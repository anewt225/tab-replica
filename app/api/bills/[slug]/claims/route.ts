import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { bills, claims, lineItems, participants } from "@/lib/db/schema";
import { bumpVersion, findParticipantForDevice } from "@/lib/bills";
import { readDeviceId } from "@/lib/device";

export const runtime = "nodejs";

const bodySchema = z.object({
  lineItemId: z.uuid(),
  /** Omit to toggle. Explicit true/false is used by the "everyone" shortcut. */
  claimed: z.boolean().optional(),
  weight: z.number().int().min(1).max(99).optional(),
});

/**
 * Claim or unclaim a line item.
 *
 * A caller may only ever modify their *own* claim — the participant is resolved
 * from the signed device cookie, never from the request body. Without that, the
 * bill URL (which gets texted around) would let anyone reassign anyone's items.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid claim." }, { status: 400 });
  }

  const bill = await db.query.bills.findFirst({ where: eq(bills.slug, slug) });
  if (!bill) return NextResponse.json({ error: "Bill not found." }, { status: 404 });
  if (bill.finalizedAt) {
    return NextResponse.json(
      { error: "This bill is finalized. Reopen it to change who had what." },
      { status: 409 },
    );
  }

  const deviceId = await readDeviceId();
  const participant = await findParticipantForDevice(bill.id, deviceId);
  if (!participant) {
    return NextResponse.json(
      { error: "Add your name to the bill before claiming items." },
      { status: 403 },
    );
  }

  // The item must belong to this bill — otherwise the id is a way to reach
  // into somebody else's receipt.
  const item = await db.query.lineItems.findFirst({
    where: and(eq(lineItems.id, parsed.data.lineItemId), eq(lineItems.billId, bill.id)),
  });
  if (!item) {
    return NextResponse.json({ error: "That item is not on this bill." }, { status: 404 });
  }

  const existing = await db.query.claims.findFirst({
    where: and(
      eq(claims.lineItemId, item.id),
      eq(claims.participantId, participant.id),
    ),
  });

  const shouldClaim = parsed.data.claimed ?? !existing;

  if (shouldClaim) {
    const weight = parsed.data.weight ?? existing?.weight ?? 1;
    if (existing) {
      await db.update(claims).set({ weight }).where(eq(claims.id, existing.id));
    } else {
      await db
        .insert(claims)
        .values({ lineItemId: item.id, participantId: participant.id, weight });
    }
  } else if (existing) {
    await db.delete(claims).where(eq(claims.id, existing.id));
  }

  const version = await bumpVersion(bill.id);
  return NextResponse.json({ ok: true, claimed: shouldClaim, version });
}

/** Remove a participant from the bill (and, by cascade, all their claims). */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const url = new URL(request.url);
  const participantId = url.searchParams.get("participantId");
  if (!participantId) {
    return NextResponse.json({ error: "participantId is required." }, { status: 400 });
  }

  const bill = await db.query.bills.findFirst({ where: eq(bills.slug, slug) });
  if (!bill) return NextResponse.json({ error: "Bill not found." }, { status: 404 });

  const deviceId = await readDeviceId();
  const viewer = await findParticipantForDevice(bill.id, deviceId);
  if (!viewer || viewer.id !== participantId) {
    return NextResponse.json(
      { error: "You can only remove yourself from a bill." },
      { status: 403 },
    );
  }

  await db
    .delete(participants)
    .where(and(eq(participants.id, participantId), eq(participants.billId, bill.id)));

  const version = await bumpVersion(bill.id);
  return NextResponse.json({ ok: true, version });
}
