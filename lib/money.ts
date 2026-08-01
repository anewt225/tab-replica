/**
 * The only place cents become dollars. Keep it that way — every other module
 * deals exclusively in integer cents.
 */

export function formatCents(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

/** "23.40" — for payment deep links, which want a bare decimal. */
export function centsToDecimalString(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/**
 * Parse user input from the review screen. Accepts "12", "12.5", "$12.50",
 * "1,234.56", "-3.00". Returns null on anything it can't read — the caller
 * decides whether that's an error, rather than silently getting a 0.
 */
export function parseCents(input: string): number | null {
  const cleaned = input.trim().replace(/[$,\s]/g, "");
  if (cleaned === "" || !/^-?\d*\.?\d*$/.test(cleaned)) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}
