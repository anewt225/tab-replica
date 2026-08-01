import { and, asc, eq, inArray, sql as raw } from "drizzle-orm";
import { customAlphabet } from "nanoid";
import { db } from "./db/client";
import { bills, claims, lineItems, participants } from "./db/schema";
import { computeSplit, reconcile } from "./split/compute";
import type { SplitResult } from "./split/compute";
import type { Bill, Claim, LineItem, Participant } from "./db/schema";

/** No look-alike characters — these slugs get read aloud and retyped. */
export const newSlug = customAlphabet("23456789abcdefghjkmnpqrstuvwxyz", 10);

export interface BillView {
  bill: Bill;
  lineItems: LineItem[];
  participants: Participant[];
  claims: Claim[];
  split: SplitResult;
  reconciliation: ReturnType<typeof reconcile>;
}

export async function getBillBySlug(slug: string): Promise<BillView | null> {
  const bill = await db.query.bills.findFirst({ where: eq(bills.slug, slug) });
  if (!bill) return null;
  return hydrate(bill);
}

export async function hydrate(bill: Bill): Promise<BillView> {
  const [items, people] = await Promise.all([
    db
      .select()
      .from(lineItems)
      .where(eq(lineItems.billId, bill.id))
      .orderBy(asc(lineItems.position)),
    db
      .select()
      .from(participants)
      .where(eq(participants.billId, bill.id))
      .orderBy(asc(participants.joinedAt)),
  ]);

  const itemIds = items.map((i) => i.id);
  const allClaims = itemIds.length
    ? await db.select().from(claims).where(inArray(claims.lineItemId, itemIds))
    : [];

  const split = computeSplit({
    lineItems: items.map((i) => ({
      id: i.id,
      totalCents: i.totalCents,
      category: i.category as "item" | "discount" | "fee",
    })),
    claims: allClaims.map((c) => ({
      lineItemId: c.lineItemId,
      participantId: c.participantId,
      weight: c.weight,
    })),
    participantIds: people.map((p) => p.id),
    taxCents: bill.taxCents,
    tipCents: bill.tipCents,
    // Before a bill is finalized, unclaimed items stay visible and unpaid so
    // the table can see what nobody has owned up to.
    splitUnclaimedEvenly: bill.finalizedAt !== null,
  });

  return {
    bill,
    lineItems: items,
    participants: people,
    claims: allClaims,
    split,
    reconciliation: reconcile({
      lineItems: items,
      taxCents: bill.taxCents,
      tipCents: bill.tipCents,
      totalCents: bill.totalCents,
    }),
  };
}

/**
 * Bump the version counter. Every mutation must call this — it is what tells
 * the other phones at the table that something changed.
 */
export async function bumpVersion(billId: string): Promise<number> {
  const [updated] = await db
    .update(bills)
    .set({ version: raw`${bills.version} + 1` })
    .where(eq(bills.id, billId))
    .returning({ version: bills.version });
  return updated?.version ?? 0;
}

export async function findParticipantForDevice(
  billId: string,
  deviceId: string | null,
): Promise<Participant | null> {
  if (!deviceId) return null;
  const found = await db.query.participants.findFirst({
    where: and(eq(participants.billId, billId), eq(participants.deviceId, deviceId)),
  });
  return found ?? null;
}

/** Shape sent to the browser. Keeps the wire format explicit and stable. */
export function serializeBill(view: BillView, viewerParticipantId: string | null) {
  return {
    slug: view.bill.slug,
    merchant: view.bill.merchant,
    purchasedAt: view.bill.purchasedAt?.toISOString() ?? null,
    currency: view.bill.currency,
    subtotalCents: view.bill.subtotalCents,
    taxCents: view.bill.taxCents,
    tipCents: view.bill.tipCents,
    totalCents: view.bill.totalCents,
    imageUrl: view.bill.imageUrl,
    ocrStatus: view.bill.ocrStatus,
    ocrError: view.bill.ocrError,
    ocrConfidence: view.bill.ocrConfidence,
    version: view.bill.version,
    finalizedAt: view.bill.finalizedAt?.toISOString() ?? null,
    payerParticipantId: view.bill.payerParticipantId,
    groupId: view.bill.groupId,
    viewerParticipantId,
    lineItems: view.lineItems.map((item) => ({
      id: item.id,
      position: item.position,
      description: item.description,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      totalCents: item.totalCents,
      category: item.category,
      claims: view.claims
        .filter((c) => c.lineItemId === item.id)
        .map((c) => ({ participantId: c.participantId, weight: c.weight })),
    })),
    participants: view.participants.map((p) => ({
      id: p.id,
      displayName: p.displayName,
      colorIndex: p.colorIndex,
      paymentHandle: p.paymentHandle,
      isViewer: p.id === viewerParticipantId,
    })),
    split: {
      participants: view.split.participants,
      unclaimedItemIds: view.split.unclaimedItemIds,
      unallocatedCents: view.split.unallocatedCents,
      computedTotalCents: view.split.computedTotalCents,
      allocatedTotalCents: view.split.allocatedTotalCents,
    },
    reconciliation: view.reconciliation,
  };
}

export type SerializedBill = ReturnType<typeof serializeBill>;
