import { centsToDecimalString } from "../money";

/**
 * Payment deep links.
 *
 * These are pure string builders. No money moves through this app, no payment
 * credentials are stored, and nothing here talks to a payment provider — a
 * handle plus an amount becomes a URL that opens the provider's own app with
 * the fields pre-filled. The user still confirms and sends the payment there.
 */

export type PaymentProvider = "venmo" | "cashapp" | "paypal";

export const PROVIDER_LABELS: Record<PaymentProvider, string> = {
  venmo: "Venmo",
  cashapp: "Cash App",
  paypal: "PayPal",
};

export interface PaymentHandle {
  provider: PaymentProvider;
  handle: string;
}

/** Stored as "venmo:alexnewton" so one column covers every provider. */
export function parseHandle(stored: string | null): PaymentHandle | null {
  if (!stored) return null;
  const [provider, ...rest] = stored.split(":");
  const handle = rest.join(":").trim().replace(/^[@$]/, "");
  if (!handle) return null;
  if (provider !== "venmo" && provider !== "cashapp" && provider !== "paypal") {
    return null;
  }
  return { provider, handle };
}

export function formatHandle(handle: PaymentHandle): string {
  return `${handle.provider}:${handle.handle}`;
}

export function paymentUrl(params: {
  handle: PaymentHandle;
  amountCents: number;
  note: string;
}): string | null {
  const { handle, amountCents, note } = params;
  // Nobody needs a deep link to be paid nothing.
  if (amountCents <= 0) return null;

  const amount = centsToDecimalString(amountCents);
  const recipient = encodeURIComponent(handle.handle);

  switch (handle.provider) {
    case "venmo":
      return `https://venmo.com/${recipient}?txn=pay&amount=${amount}&note=${encodeURIComponent(note)}`;
    case "cashapp":
      return `https://cash.app/$${recipient}/${amount}`;
    case "paypal":
      return `https://paypal.me/${recipient}/${amount}`;
  }
}

export function paymentNote(merchant: string | null, purchasedAt: string | null): string {
  const where = merchant?.trim() || "dinner";
  if (!purchasedAt) return where;
  const date = new Date(purchasedAt);
  if (Number.isNaN(date.getTime())) return where;
  const day = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
  return `${where} · ${day}`;
}
