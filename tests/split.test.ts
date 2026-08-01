import { describe, it, expect } from "vitest";
import { allocate, computeSplit, reconcile } from "@/lib/split/compute";
import type { SplitInput } from "@/lib/split/compute";

describe("allocate", () => {
  it("splits evenly when it divides cleanly", () => {
    expect(allocate(1000, [1, 1])).toEqual([500, 500]);
    expect(allocate(900, [1, 1, 1])).toEqual([300, 300, 300]);
  });

  it("distributes leftover pennies without losing or inventing any", () => {
    // $10.00 three ways is 333.33 each — one penny has to go somewhere.
    const result = allocate(1000, [1, 1, 1]);
    expect(result.reduce((a, b) => a + b, 0)).toBe(1000);
    expect(result.filter((c) => c === 334)).toHaveLength(1);
    expect(result.filter((c) => c === 333)).toHaveLength(2);
  });

  it("respects weights", () => {
    expect(allocate(900, [2, 1])).toEqual([600, 300]);
    expect(allocate(1000, [3, 1])).toEqual([750, 250]);
  });

  it("handles negative amounts (discounts) and still sums exactly", () => {
    const result = allocate(-1000, [1, 1, 1]);
    expect(result.reduce((a, b) => a + b, 0)).toBe(-1000);
  });

  it("is deterministic — identical input gives identical output", () => {
    const a = allocate(10_000_03, [7, 3, 11, 1]);
    const b = allocate(10_000_03, [7, 3, 11, 1]);
    expect(a).toEqual(b);
  });

  it("returns an empty array for no claimants", () => {
    expect(allocate(500, [])).toEqual([]);
  });

  it("falls back to an even split when all weights are invalid", () => {
    const result = allocate(1000, [0, 0]);
    expect(result.reduce((a, b) => a + b, 0)).toBe(1000);
    expect(result).toEqual([500, 500]);
  });
});

describe("computeSplit", () => {
  const base: SplitInput = {
    lineItems: [
      { id: "steak", totalCents: 4000, category: "item" },
      { id: "salad", totalCents: 800, category: "item" },
    ],
    claims: [
      { lineItemId: "steak", participantId: "alex", weight: 1 },
      { lineItemId: "salad", participantId: "bailey", weight: 1 },
    ],
    participantIds: ["alex", "bailey"],
    taxCents: 480,
    tipCents: 960,
    splitUnclaimedEvenly: false,
  };

  it("allocates tax and tip proportionally, not per head", () => {
    const result = computeSplit(base);
    const alex = result.byParticipantId.alex!;
    const bailey = result.byParticipantId.bailey!;

    // Alex ordered $40 of $48 — 5/6 of the food, so 5/6 of tax and tip.
    expect(alex.itemsCents).toBe(4000);
    expect(alex.taxCents).toBe(400);
    expect(alex.tipCents).toBe(800);
    expect(alex.totalCents).toBe(5200);

    expect(bailey.itemsCents).toBe(800);
    expect(bailey.taxCents).toBe(80);
    expect(bailey.tipCents).toBe(160);
    expect(bailey.totalCents).toBe(1040);
  });

  it("upholds the invariant: shares sum to the receipt total", () => {
    const result = computeSplit(base);
    expect(result.allocatedTotalCents).toBe(result.computedTotalCents);
    expect(result.computedTotalCents).toBe(4000 + 800 + 480 + 960);
  });

  it("splits a shared item between co-claimants", () => {
    const result = computeSplit({
      ...base,
      lineItems: [{ id: "app", totalCents: 1500, category: "item" }],
      claims: [
        { lineItemId: "app", participantId: "alex", weight: 1 },
        { lineItemId: "app", participantId: "bailey", weight: 1 },
      ],
      taxCents: 0,
      tipCents: 0,
    });
    expect(result.byParticipantId.alex!.itemsCents).toBe(750);
    expect(result.byParticipantId.bailey!.itemsCents).toBe(750);
  });

  it("honours uneven weights on a shared item", () => {
    const result = computeSplit({
      ...base,
      lineItems: [{ id: "beers", totalCents: 1800, category: "item" }],
      claims: [
        { lineItemId: "beers", participantId: "alex", weight: 2 },
        { lineItemId: "beers", participantId: "bailey", weight: 1 },
      ],
      taxCents: 0,
      tipCents: 0,
    });
    expect(result.byParticipantId.alex!.itemsCents).toBe(1200);
    expect(result.byParticipantId.bailey!.itemsCents).toBe(600);
  });

  it("reports unclaimed items instead of silently absorbing them", () => {
    const result = computeSplit({
      ...base,
      lineItems: [
        ...base.lineItems,
        { id: "mystery", totalCents: 1200, category: "item" },
      ],
    });
    expect(result.unclaimedItemIds).toEqual(["mystery"]);
    expect(result.unallocatedCents).toBe(1200);
    expect(result.allocatedTotalCents + result.unallocatedCents).toBe(
      result.computedTotalCents,
    );
  });

  it("splits unclaimed items evenly when asked to", () => {
    const result = computeSplit({
      ...base,
      lineItems: [
        ...base.lineItems,
        { id: "mystery", totalCents: 1200, category: "item" },
      ],
      splitUnclaimedEvenly: true,
    });
    expect(result.unclaimedItemIds).toEqual([]);
    expect(result.unallocatedCents).toBe(0);
    expect(result.byParticipantId.alex!.itemsCents).toBe(4600);
    expect(result.byParticipantId.bailey!.itemsCents).toBe(1400);
  });

  it("spreads an unclaimed discount proportionally", () => {
    const result = computeSplit({
      ...base,
      lineItems: [
        ...base.lineItems,
        { id: "promo", totalCents: -600, category: "discount" },
      ],
      taxCents: 0,
      tipCents: 0,
    });
    // 5/6 : 1/6 of a $6 discount.
    expect(result.byParticipantId.alex!.adjustmentsCents).toBe(-500);
    expect(result.byParticipantId.bailey!.adjustmentsCents).toBe(-100);
    expect(result.allocatedTotalCents).toBe(4000 + 800 - 600);
  });

  it("assigns a discount to one person when they claim it", () => {
    const result = computeSplit({
      ...base,
      lineItems: [
        ...base.lineItems,
        { id: "promo", totalCents: -600, category: "discount" },
      ],
      claims: [
        ...base.claims,
        { lineItemId: "promo", participantId: "bailey", weight: 1 },
      ],
      taxCents: 0,
      tipCents: 0,
    });
    expect(result.byParticipantId.bailey!.itemsCents).toBe(200);
    expect(result.byParticipantId.alex!.itemsCents).toBe(4000);
  });

  it("spreads an unclaimed service fee proportionally", () => {
    const result = computeSplit({
      ...base,
      lineItems: [
        ...base.lineItems,
        { id: "svc", totalCents: 480, category: "fee" },
      ],
      taxCents: 0,
      tipCents: 0,
    });
    expect(result.byParticipantId.alex!.adjustmentsCents).toBe(400);
    expect(result.byParticipantId.bailey!.adjustmentsCents).toBe(80);
  });

  it("falls back to an even split of tax when nobody has claimed anything", () => {
    const result = computeSplit({
      ...base,
      claims: [],
      splitUnclaimedEvenly: false,
    });
    expect(result.byParticipantId.alex!.taxCents).toBe(240);
    expect(result.byParticipantId.bailey!.taxCents).toBe(240);
  });

  it("handles a bill with no participants without dividing by zero", () => {
    const result = computeSplit({ ...base, participantIds: [], claims: [] });
    expect(result.participants).toEqual([]);
    expect(result.unallocatedCents).toBe(result.computedTotalCents);
  });

  it("ignores claims from participants who have left", () => {
    const result = computeSplit({
      ...base,
      claims: [
        ...base.claims,
        { lineItemId: "steak", participantId: "ghost", weight: 1 },
      ],
    });
    expect(result.byParticipantId.ghost).toBeUndefined();
    expect(result.byParticipantId.alex!.itemsCents).toBe(4000);
  });

  it("produces the same answer regardless of input ordering", () => {
    const shuffled: SplitInput = {
      ...base,
      participantIds: ["bailey", "alex"],
      claims: [...base.claims].reverse(),
      lineItems: [...base.lineItems].reverse(),
    };
    expect(computeSplit(shuffled).byParticipantId).toEqual(
      computeSplit(base).byParticipantId,
    );
  });
});

describe("reconcile", () => {
  it("passes when the parts add up to the printed total", () => {
    const r = reconcile({
      lineItems: [{ totalCents: 4000 }, { totalCents: 800 }],
      taxCents: 480,
      tipCents: 960,
      totalCents: 6240,
    });
    expect(r.balanced).toBe(true);
    expect(r.discrepancyCents).toBe(0);
  });

  it("reports the gap when OCR misread a line", () => {
    const r = reconcile({
      lineItems: [{ totalCents: 4000 }],
      taxCents: 480,
      tipCents: 960,
      totalCents: 6240,
    });
    expect(r.balanced).toBe(false);
    expect(r.discrepancyCents).toBe(800);
  });
});
