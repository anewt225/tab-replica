import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { bills, groupMembers, participants } from "@/lib/db/schema";
import { bumpVersion, findParticipantForDevice } from "@/lib/bills";
import { ensureDeviceId } from "@/lib/device";
import { normalizeName } from "@/lib/split/balances";
import { PARTICIPANT_COLORS } from "@/lib/colors";

export const runtime = "nodejs";

const joinSchema = z.object({
  displayName: z.string().trim().min(1).max(60),
  paymentHandle: z.string().trim().max(120).nullable().optional(),
});

/**
 * Join a bill. No login: the caller's device cookie becomes their identity, and
 * a device that has already joined is renamed rather than duplicated — which is
 * what someone tapping "join" twice actually means.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const parsed = joinSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "A name is required." }, { status: 400 });
  }

  const bill = await db.query.bills.findFirst({ where: eq(bills.slug, slug) });
  if (!bill) return NextResponse.json({ error: "Bill not found." }, { status: 404 });

  const deviceId = await ensureDeviceId();
  const { displayName, paymentHandle } = parsed.data;

  const existing = await findParticipantForDevice(bill.id, deviceId);
  if (existing) {
    const [updated] = await db
      .update(participants)
      .set({ displayName, ...(paymentHandle !== undefined ? { paymentHandle } : {}) })
      .where(eq(participants.id, existing.id))
      .returning();
    const version = await bumpVersion(bill.id);
    return NextResponse.json({ participant: updated, version });
  }

  const current = await db
    .select({ id: participants.id })
    .from(participants)
    .where(eq(participants.billId, bill.id));

  // Link to a group member when the bill belongs to a group, so balances can
  // follow this person across dinners.
  let groupMemberId: string | null = null;
  if (bill.groupId) {
    const normalized = normalizeName(displayName);
    const member = await db.query.groupMembers.findFirst({
      where: and(
        eq(groupMembers.groupId, bill.groupId),
        eq(groupMembers.normalizedName, normalized),
      ),
    });
    if (member) {
      groupMemberId = member.id;
    } else {
      const [created] = await db
        .insert(groupMembers)
        .values({ groupId: bill.groupId, displayName, normalizedName: normalized })
        .returning();
      groupMemberId = created?.id ?? null;
    }
  }

  const [participant] = await db
    .insert(participants)
    .values({
      billId: bill.id,
      displayName,
      deviceId,
      groupMemberId,
      paymentHandle: paymentHandle ?? null,
      colorIndex: current.length % PARTICIPANT_COLORS.length,
    })
    .returning();

  const version = await bumpVersion(bill.id);
  return NextResponse.json({ participant, version }, { status: 201 });
}
