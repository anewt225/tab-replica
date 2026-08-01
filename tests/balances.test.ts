import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  ledgerForBill,
  netBalances,
  simplifyDebts,
  normalizeName,
} from "@/lib/split/balances";

describe("ledgerForBill", () => {
  it("credits the payer for what they covered on everyone else's behalf", () => {
    const ledger = ledgerForBill({
      payerMemberId: "alex",
      sharesByMemberId: { alex: 2000, bailey: 3000, casey: 1000 },
    });
    const byId = Object.fromEntries(ledger.map((e) => [e.memberId, e.deltaCents]));
    expect(byId.alex).toBe(4000); // paid 6000, ate 2000
    expect(byId.bailey).toBe(-3000);
    expect(byId.casey).toBe(-1000);
  });

  it("nets to zero", () => {
    const ledger = ledgerForBill({
      payerMemberId: "alex",
      sharesByMemberId: { alex: 1234, bailey: 5678 },
    });
    expect(ledger.reduce((s, e) => s + e.deltaCents, 0)).toBe(0);
  });

  it("leaves the payer flat when they dined alone", () => {
    const ledger = ledgerForBill({
      payerMemberId: "alex",
      sharesByMemberId: { alex: 4200 },
    });
    expect(ledger).toEqual([{ memberId: "alex", deltaCents: 0 }]);
  });
});

describe("netBalances", () => {
  it("accumulates across several bills", () => {
    const b1 = ledgerForBill({
      payerMemberId: "alex",
      sharesByMemberId: { alex: 1000, bailey: 1000 },
    });
    const b2 = ledgerForBill({
      payerMemberId: "bailey",
      sharesByMemberId: { alex: 500, bailey: 500 },
    });
    expect(netBalances([b1, b2])).toEqual({ alex: 500, bailey: -500 });
  });

  it("applies settlements", () => {
    const bill = ledgerForBill({
      payerMemberId: "alex",
      sharesByMemberId: { alex: 1000, bailey: 1000 },
    });
    const balances = netBalances([bill], [
      { fromMemberId: "bailey", toMemberId: "alex", amountCents: 1000 },
    ]);
    expect(balances).toEqual({ alex: 0, bailey: 0 });
  });
});

describe("simplifyDebts", () => {
  it("collapses a chain into a single transfer", () => {
    // A owes B $12, B owes C $12 → A pays C $12.
    const transfers = simplifyDebts({ a: -1200, b: 0, c: 1200 });
    expect(transfers).toEqual([
      { fromMemberId: "a", toMemberId: "c", amountCents: 1200 },
    ]);
  });

  it("returns nothing when everyone is square", () => {
    expect(simplifyDebts({ a: 0, b: 0 })).toEqual([]);
  });

  it("settles the balances it is given", () => {
    const balances = { a: -3000, b: -1000, c: 2500, d: 1500 };
    const transfers = simplifyDebts(balances);

    const applied = { ...balances };
    for (const t of transfers) {
      applied[t.fromMemberId as keyof typeof applied] += t.amountCents;
      applied[t.toMemberId as keyof typeof applied] -= t.amountCents;
    }
    expect(Object.values(applied).every((v) => v === 0)).toBe(true);
  });

  it("uses at most (people - 1) transfers", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: -100_000, max: 100_000 }), {
          minLength: 2,
          maxLength: 12,
        }),
        (raw) => {
          // Force the balances to sum to zero, as real balances always do.
          const sum = raw.reduce((a, b) => a + b, 0);
          const balances: Record<string, number> = {};
          raw.forEach((v, i) => {
            balances[`m${i}`] = i === 0 ? v - sum : v;
          });

          const transfers = simplifyDebts(balances);
          expect(transfers.length).toBeLessThanOrEqual(raw.length - 1);

          const applied = { ...balances };
          for (const t of transfers) {
            applied[t.fromMemberId]! += t.amountCents;
            applied[t.toMemberId]! -= t.amountCents;
          }
          expect(Object.values(applied).every((v) => v === 0)).toBe(true);
        },
      ),
      { numRuns: 800 },
    );
  });
});

describe("normalizeName", () => {
  it("matches the same person written different ways", () => {
    expect(normalizeName("Alex Newton")).toBe(normalizeName("  alex   newton "));
    expect(normalizeName("Bailey!")).toBe("bailey");
  });

  it("keeps different people distinct", () => {
    expect(normalizeName("Alex")).not.toBe(normalizeName("Alexa"));
  });
});
