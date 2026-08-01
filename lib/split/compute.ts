/**
 * Bill splitting math.
 *
 * Pure functions, integer cents only, no I/O. The whole module exists to
 * uphold one invariant:
 *
 *     sum(every participant's total) + unallocatedCents === computedTotalCents
 *
 * A splitting app that is off by a penny is a splitting app nobody trusts, so
 * that invariant is asserted here and property-tested in tests/split.property.test.ts.
 */

export type LineItemCategory = "item" | "discount" | "fee";

export interface SplitLineItem {
  id: string;
  totalCents: number;
  category: LineItemCategory;
}

export interface SplitClaim {
  lineItemId: string;
  participantId: string;
  /** Relative share. 1 for an even split; 2 vs 1 for "I had two of the three". */
  weight: number;
}

export interface SplitInput {
  lineItems: SplitLineItem[];
  claims: SplitClaim[];
  participantIds: string[];
  taxCents: number;
  tipCents: number;
  /**
   * When true, items nobody claimed are divided evenly across everyone.
   * When false they are left unallocated and reported in `unclaimedItemIds`,
   * so the UI can refuse to finalize until they're resolved.
   */
  splitUnclaimedEvenly: boolean;
}

export interface ItemShare {
  lineItemId: string;
  shareCents: number;
  /** How many people are splitting this item (including this participant). */
  claimantCount: number;
  weight: number;
}

export interface ParticipantBreakdown {
  participantId: string;
  /** Items this person claimed, net of any discounts they claimed directly. */
  itemsCents: number;
  /** Their slice of unclaimed discounts and service fees. */
  adjustmentsCents: number;
  taxCents: number;
  tipCents: number;
  /** itemsCents + adjustmentsCents + taxCents + tipCents */
  totalCents: number;
  shares: ItemShare[];
}

export interface SplitResult {
  participants: ParticipantBreakdown[];
  byParticipantId: Record<string, ParticipantBreakdown>;
  /** Items with no claimants (empty when splitUnclaimedEvenly is true). */
  unclaimedItemIds: string[];
  /** Money belonging to unclaimed items — nobody is paying this yet. */
  unallocatedCents: number;
  /** sum(line items) + tax + tip. The number the shares must add up to. */
  computedTotalCents: number;
  /** sum of every participant total. */
  allocatedTotalCents: number;
}

/**
 * Divide `amountCents` across `weights` using the largest-remainder method:
 * everyone gets their floor, then leftover pennies go to the largest
 * fractional parts, ties broken by position.
 *
 * Callers pass participants in a stable (id-sorted) order, so the same bill
 * always produces the same answer — nobody's share changes because a row came
 * back from Postgres in a different order.
 *
 * Exact integer arithmetic throughout; no floating point is involved.
 * Handles negative amounts (discounts) and guarantees `sum(result) === amountCents`.
 */
export function allocate(amountCents: number, weights: number[]): number[] {
  const n = weights.length;
  if (n === 0) return [];

  const safeWeights = weights.map((w) => (Number.isFinite(w) && w > 0 ? Math.floor(w) : 1));
  const totalWeight = safeWeights.reduce((a, b) => a + b, 0);
  if (totalWeight <= 0) return new Array<number>(n).fill(0);

  const sign = amountCents < 0 ? -1 : 1;
  const abs = Math.abs(amountCents);

  const floors: number[] = new Array(n);
  const remainders: number[] = new Array(n);
  let distributed = 0;

  for (let i = 0; i < n; i++) {
    const numerator = abs * safeWeights[i]!;
    const share = Math.floor(numerator / totalWeight);
    floors[i] = share;
    remainders[i] = numerator % totalWeight;
    distributed += share;
  }

  let leftover = abs - distributed;
  const order = remainders
    .map((rem, i) => ({ i, rem }))
    .sort((a, b) => b.rem - a.rem || a.i - b.i);

  for (let k = 0; k < leftover && k < n; k++) {
    floors[order[k]!.i]! += 1;
  }

  return floors.map((v) => v * sign);
}

/** Weights for proportional allocation, clamped so negatives never distort. */
function proportionalWeights(bases: number[]): number[] {
  const clamped = bases.map((b) => Math.max(0, b));
  const sum = clamped.reduce((a, b) => a + b, 0);
  // Nobody has claimed anything with a positive value yet — fall back to even.
  return sum === 0 ? clamped.map(() => 1) : clamped;
}

export function computeSplit(input: SplitInput): SplitResult {
  const { taxCents, tipCents, splitUnclaimedEvenly } = input;

  // Stable ordering is what makes penny distribution deterministic.
  const participantIds = [...input.participantIds].sort();
  const n = participantIds.length;
  const indexOf = new Map(participantIds.map((id, i) => [id, i]));

  const computedTotalCents =
    input.lineItems.reduce((sum, li) => sum + li.totalCents, 0) + taxCents + tipCents;

  if (n === 0) {
    return {
      participants: [],
      byParticipantId: {},
      unclaimedItemIds: input.lineItems
        .filter((li) => li.category === "item")
        .map((li) => li.id),
      unallocatedCents: computedTotalCents,
      computedTotalCents,
      allocatedTotalCents: 0,
    };
  }

  const claimsByItem = new Map<string, SplitClaim[]>();
  for (const claim of input.claims) {
    if (!indexOf.has(claim.participantId)) continue; // stale claim, participant gone
    const list = claimsByItem.get(claim.lineItemId);
    if (list) list.push(claim);
    else claimsByItem.set(claim.lineItemId, [claim]);
  }

  const itemsCents = new Array<number>(n).fill(0);
  const adjustmentsCents = new Array<number>(n).fill(0);
  const shares: ItemShare[][] = Array.from({ length: n }, () => []);
  const unclaimedItemIds: string[] = [];
  let unallocatedCents = 0;
  let pooledAdjustmentCents = 0;

  for (const item of input.lineItems) {
    const claims = (claimsByItem.get(item.id) ?? []).sort((a, b) =>
      a.participantId < b.participantId ? -1 : a.participantId > b.participantId ? 1 : 0,
    );

    if (claims.length === 0) {
      if (item.category !== "item") {
        // An unclaimed discount or service fee belongs to the whole table;
        // it gets spread proportionally alongside tax and tip below.
        pooledAdjustmentCents += item.totalCents;
        continue;
      }
      if (!splitUnclaimedEvenly) {
        unclaimedItemIds.push(item.id);
        unallocatedCents += item.totalCents;
        continue;
      }
      // Split evenly across everyone.
      const even = allocate(item.totalCents, new Array<number>(n).fill(1));
      for (let i = 0; i < n; i++) {
        itemsCents[i]! += even[i]!;
        shares[i]!.push({
          lineItemId: item.id,
          shareCents: even[i]!,
          claimantCount: n,
          weight: 1,
        });
      }
      continue;
    }

    const weights = claims.map((c) => c.weight);
    const amounts = allocate(item.totalCents, weights);
    for (let k = 0; k < claims.length; k++) {
      const i = indexOf.get(claims[k]!.participantId)!;
      itemsCents[i]! += amounts[k]!;
      shares[i]!.push({
        lineItemId: item.id,
        shareCents: amounts[k]!,
        claimantCount: claims.length,
        weight: claims[k]!.weight,
      });
    }
  }

  // Unclaimed discounts / fees, spread by how much of the food each person had.
  if (pooledAdjustmentCents !== 0) {
    const spread = allocate(pooledAdjustmentCents, proportionalWeights(itemsCents));
    for (let i = 0; i < n; i++) adjustmentsCents[i]! += spread[i]!;
  }

  // Tax and tip are proportional to what each person actually ordered — if you
  // had the $40 steak and I had the $8 salad, you pay 5x the tax and 5x the tip.
  const basis = itemsCents.map((c, i) => c + adjustmentsCents[i]!);
  const weightsForShared = proportionalWeights(basis);
  const taxShares = allocate(taxCents, weightsForShared);
  const tipShares = allocate(tipCents, weightsForShared);

  const participants: ParticipantBreakdown[] = participantIds.map((id, i) => {
    const total = itemsCents[i]! + adjustmentsCents[i]! + taxShares[i]! + tipShares[i]!;
    return {
      participantId: id,
      itemsCents: itemsCents[i]!,
      adjustmentsCents: adjustmentsCents[i]!,
      taxCents: taxShares[i]!,
      tipCents: tipShares[i]!,
      totalCents: total,
      shares: shares[i]!,
    };
  });

  const allocatedTotalCents = participants.reduce((s, p) => s + p.totalCents, 0);

  // The invariant. If this ever trips it is a bug in this file, and the caller
  // must surface an error rather than show somebody a wrong number.
  if (allocatedTotalCents + unallocatedCents !== computedTotalCents) {
    throw new Error(
      `Split invariant violated: allocated ${allocatedTotalCents} + unallocated ` +
        `${unallocatedCents} != computed ${computedTotalCents}`,
    );
  }

  return {
    participants,
    byParticipantId: Object.fromEntries(participants.map((p) => [p.participantId, p])),
    unclaimedItemIds,
    unallocatedCents,
    computedTotalCents,
    allocatedTotalCents,
  };
}

/**
 * Does the receipt's printed total match its parts? OCR gets this wrong often
 * enough that the review screen is built around the answer.
 */
export function reconcile(params: {
  lineItems: Pick<SplitLineItem, "totalCents">[];
  taxCents: number;
  tipCents: number;
  totalCents: number;
}): { computedTotalCents: number; discrepancyCents: number; balanced: boolean } {
  const computedTotalCents =
    params.lineItems.reduce((s, li) => s + li.totalCents, 0) +
    params.taxCents +
    params.tipCents;
  const discrepancyCents = params.totalCents - computedTotalCents;
  return { computedTotalCents, discrepancyCents, balanced: discrepancyCents === 0 };
}
