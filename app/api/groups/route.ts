import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { bills, groupMembers, groups, participants } from "@/lib/db/schema";
import { newSlug } from "@/lib/bills";
import { normalizeName } from "@/lib/split/balances";

export const runtime = "nodejs";

const bodySchema = z.object({
  name: z.string().trim().min(1).max(80),
  /** Attach an existing bill to the new group. */
  billSlug: z.string().trim().min(1).max(40).optional(),
});

/** Create a group, optionally moving a bill (and its people) into it. */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "A group name is required." }, { status: 400 });
  }

  const slug = newSlug();
  const [group] = await db
    .insert(groups)
    .values({ slug, name: parsed.data.name })
    .returning();

  if (!group) {
    return NextResponse.json({ error: "Could not create the group." }, { status: 500 });
  }

  if (parsed.data.billSlug) {
    const bill = await db.query.bills.findFirst({
      where: eq(bills.slug, parsed.data.billSlug),
    });

    if (bill && !bill.groupId) {
      await db.update(bills).set({ groupId: group.id }).where(eq(bills.id, bill.id));

      // Everyone already on the bill becomes a member, so their share counts
      // toward balances immediately rather than only on the next dinner.
      const people = await db
        .select()
        .from(participants)
        .where(eq(participants.billId, bill.id));

      for (const person of people) {
        if (person.groupMemberId) continue;
        const [member] = await db
          .insert(groupMembers)
          .values({
            groupId: group.id,
            displayName: person.displayName,
            normalizedName: normalizeName(person.displayName),
          })
          .onConflictDoNothing()
          .returning();

        const memberId =
          member?.id ??
          (
            await db.query.groupMembers.findFirst({
              where: eq(groupMembers.normalizedName, normalizeName(person.displayName)),
            })
          )?.id;

        if (memberId) {
          await db
            .update(participants)
            .set({ groupMemberId: memberId })
            .where(eq(participants.id, person.id));
        }
      }
    }
  }

  return NextResponse.json({ slug: group.slug, name: group.name }, { status: 201 });
}
