import { describe, it, expect } from "vitest";
import {
  parseHandle,
  formatHandle,
  paymentUrl,
  paymentNote,
} from "@/lib/payments/links";
import { centsToDecimalString, parseCents, formatCents } from "@/lib/money";

describe("centsToDecimalString", () => {
  it("always shows two decimal places", () => {
    expect(centsToDecimalString(2340)).toBe("23.40");
    expect(centsToDecimalString(5)).toBe("0.05");
    expect(centsToDecimalString(100)).toBe("1.00");
    expect(centsToDecimalString(0)).toBe("0.00");
  });

  it("handles negative amounts", () => {
    expect(centsToDecimalString(-2340)).toBe("-23.40");
    expect(centsToDecimalString(-5)).toBe("-0.05");
  });

  it("never loses precision on values that break floats", () => {
    // 0.1 + 0.2 territory — the reason this codebase uses integer cents.
    expect(centsToDecimalString(1010)).toBe("10.10");
    expect(centsToDecimalString(70)).toBe("0.70");
  });
});

describe("parseCents", () => {
  it("reads the ways people actually type money", () => {
    expect(parseCents("12")).toBe(1200);
    expect(parseCents("12.5")).toBe(1250);
    expect(parseCents("12.50")).toBe(1250);
    expect(parseCents("$12.50")).toBe(1250);
    expect(parseCents("1,234.56")).toBe(123456);
    expect(parseCents(" 8.99 ")).toBe(899);
    expect(parseCents("-3.00")).toBe(-300);
  });

  it("returns null rather than a silent zero on garbage", () => {
    expect(parseCents("")).toBeNull();
    expect(parseCents("abc")).toBeNull();
    expect(parseCents("1.2.3")).toBeNull();
  });

  it("round-trips with centsToDecimalString", () => {
    for (const cents of [0, 5, 99, 100, 1250, 123456, -300]) {
      expect(parseCents(centsToDecimalString(cents))).toBe(cents);
    }
  });
});

describe("formatCents", () => {
  it("renders currency for display", () => {
    expect(formatCents(2340)).toBe("$23.40");
    expect(formatCents(0)).toBe("$0.00");
  });
});

describe("parseHandle", () => {
  it("reads the stored format", () => {
    expect(parseHandle("venmo:alexnewton")).toEqual({
      provider: "venmo",
      handle: "alexnewton",
    });
  });

  it("strips the sigil people type out of habit", () => {
    expect(parseHandle("venmo:@alexnewton")?.handle).toBe("alexnewton");
    expect(parseHandle("cashapp:$alexnewton")?.handle).toBe("alexnewton");
  });

  it("rejects unknown providers and empty handles", () => {
    expect(parseHandle("zelle:alex")).toBeNull();
    expect(parseHandle("venmo:")).toBeNull();
    expect(parseHandle(null)).toBeNull();
  });

  it("round-trips", () => {
    const handle = { provider: "paypal" as const, handle: "alexnewton" };
    expect(parseHandle(formatHandle(handle))).toEqual(handle);
  });
});

describe("paymentUrl", () => {
  const handle = { provider: "venmo" as const, handle: "alexnewton" };

  it("builds a Venmo link with the exact amount", () => {
    const url = paymentUrl({ handle, amountCents: 2340, note: "Lucia · Jul 31" });
    expect(url).toContain("https://venmo.com/alexnewton");
    expect(url).toContain("amount=23.40");
    expect(url).toContain("txn=pay");
  });

  it("builds Cash App and PayPal links", () => {
    expect(
      paymentUrl({
        handle: { provider: "cashapp", handle: "alex" },
        amountCents: 500,
        note: "x",
      }),
    ).toBe("https://cash.app/$alex/5.00");

    expect(
      paymentUrl({
        handle: { provider: "paypal", handle: "alex" },
        amountCents: 500,
        note: "x",
      }),
    ).toBe("https://paypal.me/alex/5.00");
  });

  it("escapes notes so a merchant name can't break the URL", () => {
    const url = paymentUrl({ handle, amountCents: 100, note: "Joe's Bar & Grill" });
    // The ampersand must not start a new query parameter.
    expect(url).not.toContain("&Grill");
    expect(url).toContain("%26");
    expect(url).toContain("Bar%20%26%20Grill");
    // The amount survives a note containing delimiters.
    expect(new URL(url!).searchParams.get("amount")).toBe("1.00");
    expect(new URL(url!).searchParams.get("note")).toBe("Joe's Bar & Grill");
  });

  it("returns null when there is nothing to pay", () => {
    expect(paymentUrl({ handle, amountCents: 0, note: "x" })).toBeNull();
    expect(paymentUrl({ handle, amountCents: -100, note: "x" })).toBeNull();
  });
});

describe("paymentNote", () => {
  it("names the place and the day", () => {
    expect(paymentNote("Lucia", "2026-07-31T19:42:00Z")).toMatch(/^Lucia · Jul 3[01]$/);
  });

  it("degrades gracefully without a merchant or a date", () => {
    expect(paymentNote(null, null)).toBe("dinner");
    expect(paymentNote("Lucia", "not-a-date")).toBe("Lucia");
  });
});
