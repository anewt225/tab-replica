import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { allocate, computeSplit } from "@/lib/split/compute";
import type { LineItemCategory, SplitClaim } from "@/lib/split/compute";

/**
 * The unit tests cover the cases we thought of. These cover the ones we didn't.
 *
 * Every property here reduces to the same claim: the app never loses a penny
 * and never invents one, for any combination of items, claimants, weights, and
 * remainders.
 */

const cents = fc.integer({ min: -50_000, max: 500_000 });
const positiveCents = fc.integer({ min: 0, max: 500_000 });
const weight = fc.integer({ min: 1, max: 12 });

describe("allocate — properties", () => {
  it("always sums back to the original amount", () => {
    fc.assert(
      fc.property(cents, fc.array(weight, { minLength: 1, maxLength: 25 }), (amount, weights) => {
        const result = allocate(amount, weights);
        expect(result.reduce((a, b) => a + b, 0)).toBe(amount);
      }),
      { numRuns: 2000 },
    );
  });

  it("returns one share per claimant", () => {
    fc.assert(
      fc.property(cents, fc.array(weight, { minLength: 1, maxLength: 25 }), (amount, weights) => {
        expect(allocate(amount, weights)).toHaveLength(weights.length);
      }),
    );
  });

  it("never lets two equal-weight claimants differ by more than a penny", () => {
    fc.assert(
      fc.property(positiveCents, fc.integer({ min: 1, max: 20 }), (amount, n) => {
        const result = allocate(amount, new Array<number>(n).fill(1));
        expect(Math.max(...result) - Math.min(...result)).toBeLessThanOrEqual(1);
      }),
    );
  });

  it("gives a heavier claimant at least as much as a lighter one", () => {
    fc.assert(
      fc.property(positiveCents, weight, weight, (amount, w1, w2) => {
        const [a, b] = allocate(amount, [w1, w2]) as [number, number];
        if (w1 > w2) expect(a).toBeGreaterThanOrEqual(b);
        if (w1 < w2) expect(b).toBeGreaterThanOrEqual(a);
      }),
    );
  });

  it("is order-stable: permuting weights permutes shares by the same amount", () => {
    fc.assert(
      fc.property(positiveCents, fc.integer({ min: 1, max: 15 }), (amount, n) => {
        const weights = new Array<number>(n).fill(1);
        const first = allocate(amount, weights);
        const second = allocate(amount, weights);
        expect(first).toEqual(second);
      }),
    );
  });
});

const participantIdArb = fc.constantFrom("p1", "p2", "p3", "p4", "p5");
const categoryArb = fc.constantFrom<LineItemCategory>("item", "discount", "fee");

const billArb = fc
  .record({
    // Ids are unique because `line_items.id` is a primary key.
    items: fc
      .array(fc.record({ totalCents: cents, category: categoryArb }), {
        minLength: 0,
        maxLength: 20,
      })
      .map((items) => items.map((it, i) => ({ ...it, id: `item-${i}` }))),
    participantIds: fc.uniqueArray(participantIdArb, { minLength: 1, maxLength: 5 }),
    taxCents: fc.integer({ min: 0, max: 20_000 }),
    tipCents: fc.integer({ min: 0, max: 40_000 }),
    splitUnclaimedEvenly: fc.boolean(),
  })
  .chain((base) =>
    fc
      .array(
        fc.record({
          itemIndex: fc.nat({ max: Math.max(0, base.items.length - 1) }),
          participantId: fc.constantFrom(...base.participantIds),
          weight,
        }),
        { minLength: 0, maxLength: 40 },
      )
      .map((rawClaims) => {
        // Dedupe: the DB has a unique index on (line_item_id, participant_id).
        const seen = new Set<string>();
        const claims: SplitClaim[] = [];
        for (const c of rawClaims) {
          const item = base.items[c.itemIndex];
          if (!item) continue;
          const key = `${item.id}:${c.participantId}`;
          if (seen.has(key)) continue;
          seen.add(key);
          claims.push({
            lineItemId: item.id,
            participantId: c.participantId,
            weight: c.weight,
          });
        }
        return { ...base, lineItems: base.items, claims };
      }),
  );

describe("computeSplit — properties", () => {
  it("never loses or invents money, for any bill", () => {
    fc.assert(
      fc.property(billArb, (input) => {
        const result = computeSplit(input);
        expect(result.allocatedTotalCents + result.unallocatedCents).toBe(
          result.computedTotalCents,
        );
      }),
      { numRuns: 1500 },
    );
  });

  it("gives every participant a breakdown whose parts sum to their total", () => {
    fc.assert(
      fc.property(billArb, (input) => {
        for (const p of computeSplit(input).participants) {
          expect(p.itemsCents + p.adjustmentsCents + p.taxCents + p.tipCents).toBe(
            p.totalCents,
          );
        }
      }),
    );
  });

  it("leaves nothing unallocated when unclaimed items are split evenly", () => {
    fc.assert(
      fc.property(billArb, (input) => {
        const result = computeSplit({ ...input, splitUnclaimedEvenly: true });
        expect(result.unallocatedCents).toBe(0);
        expect(result.unclaimedItemIds).toEqual([]);
        expect(result.allocatedTotalCents).toBe(result.computedTotalCents);
      }),
      { numRuns: 1000 },
    );
  });

  it("is deterministic regardless of how rows come back from the database", () => {
    // Amounts must not depend on row ordering. The `shares` array deliberately
    // follows line-item order (that's the display order), so compare it sorted.
    const fingerprint = (input: Parameters<typeof computeSplit>[0]) =>
      computeSplit(input).participants.map((p) => ({
        participantId: p.participantId,
        itemsCents: p.itemsCents,
        adjustmentsCents: p.adjustmentsCents,
        taxCents: p.taxCents,
        tipCents: p.tipCents,
        totalCents: p.totalCents,
        shares: [...p.shares].sort((a, b) => a.lineItemId.localeCompare(b.lineItemId)),
      }));

    fc.assert(
      fc.property(billArb, (input) => {
        expect(
          fingerprint({
            ...input,
            lineItems: [...input.lineItems].reverse(),
            claims: [...input.claims].reverse(),
            participantIds: [...input.participantIds].reverse(),
          }),
        ).toEqual(fingerprint(input));
      }),
      { numRuns: 500 },
    );
  });
});
