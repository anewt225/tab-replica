import { asc, eq, inArray } from "drizzle-orm";
import { db } from "./db/client";
import {
  bills,
  claims,
  groupMembers,
  groups,
  lineItems,
  participants,
  settlements,
} from "./db/schema";
import { computeSplit } from "./split/compute";
import { ledgerForBill, netBalances, simplifyDebts } from "./split/balances";
import type { Transfer } from "./split/balances";

export interface GroupSummary {
  group: typeof groups.$inferSelect;
  members: (typeof groupMembers.$inferSelect)[];
  balances: Record<string, number>;
  transfers: Transfer[];
  bills: {
    slug: string;
    merchant: string | null;
    totalCents: number;
    currency: string;
    createdAt: Date;
    payerName: string | null;
  }[];
  /** Bills that can't affect balances yet, and why. */
  skipped: { slug: string; merchant: string | null; reason: string }[];
}

/**
 * Roll a group's bills into net balances.
 *
 * A bill only contributes once it has a payer — until someone says "I put this
 * on my card" there is no debt to record, just a split. Those bills are
 * reported in `skipped` so the UI can nudge rather than silently ignore them.
 */
export async function getGroupSummary(slug: string): Promise<GroupSummary | null> {
  const group = await db.query.groups.findFirst({ where: eq(groups.slug, slug) });
  if (!group) return null;

  const [members, groupBills] = await Promise.all([
    db
      .select()
      .from(groupMembers)
      .where(eq(groupMembers.groupId, group.id))
      .orderBy(asc(groupMembers.createdAt)),
    db
      .select()
      .from(bills)
      .where(eq(bills.groupId, group.id))
      .orderBy(asc(bills.createdAt)),
  ]);

  const ledgers = [];
  const billRows: GroupSummary["bills"] = [];
  const skipped: GroupSummary["skipped"] = [];

  for (const bill of groupBills) {
    const [items, people] = await Promise.all([
      db.select().from(lineItems).where(eq(lineItems.billId, bill.id)),
      db.select().from(participants).where(eq(participants.billId, bill.id)),
    ]);

    const itemIds = items.map((i) => i.id);
    const billClaims = itemIds.length
      ? await db.select().from(claims).where(inArray(claims.lineItemId, itemIds))
      : [];

    const payer = people.find((p) => p.id === bill.payerParticipantId);

    billRows.push({
      slug: bill.slug,
      merchant: bill.merchant,
      totalCents: bill.totalCents,
      currency: bill.currency,
      createdAt: bill.createdAt,
      payerName: payer?.displayName ?? null,
    });

    if (!payer?.groupMemberId) {
      skipped.push({
        slug: bill.slug,
        merchant: bill.merchant,
        reason: payer
          ? "the payer isn't linked to this group yet"
          : "nobody has said they paid it",
      });
      continue;
    }

    const split = computeSplit({
      lineItems: items.map((i) => ({
        id: i.id,
        totalCents: i.totalCents,
        category: i.category as "item" | "discount" | "fee",
      })),
      claims: billClaims.map((c) => ({
        lineItemId: c.lineItemId,
        participantId: c.participantId,
        weight: c.weight,
      })),
      participantIds: people.map((p) => p.id),
      taxCents: bill.taxCents,
      tipCents: bill.tipCents,
      splitUnclaimedEvenly: true,
    });

    // Shares are keyed by participant; balances are keyed by group member.
    const sharesByMemberId: Record<string, number> = {};
    let unlinked = false;
    for (const share of split.participants) {
      const person = people.find((p) => p.id === share.participantId);
      if (!person?.groupMemberId) {
        unlinked = true;
        continue;
      }
      sharesByMemberId[person.groupMemberId] =
        (sharesByMemberId[person.groupMemberId] ?? 0) + share.totalCents;
    }

    if (unlinked) {
      skipped.push({
        slug: bill.slug,
        merchant: bill.merchant,
        reason: "someone on it isn't linked to this group",
      });
      continue;
    }

    ledgers.push(ledgerForBill({ payerMemberId: payer.groupMemberId, sharesByMemberId }));
  }

  const groupSettlements = await db
    .select()
    .from(settlements)
    .where(eq(settlements.groupId, group.id));

  const balances = netBalances(
    ledgers,
    groupSettlements.map((s) => ({
      fromMemberId: s.fromMemberId,
      toMemberId: s.toMemberId,
      amountCents: s.amountCents,
    })),
  );

  // Every member appears, including those already square.
  for (const member of members) balances[member.id] ??= 0;

  return {
    group,
    members,
    balances,
    transfers: simplifyDebts(balances).map((t) => ({
      ...t,
      // Names resolved at render; ids kept for the settle-up call.
    })),
    bills: billRows.reverse(),
    skipped,
  };
}

export function memberName(
  members: (typeof groupMembers.$inferSelect)[],
  id: string,
): string {
  return members.find((m) => m.id === id)?.displayName ?? "Someone";
}
