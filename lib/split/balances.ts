/**
 * Group balances: who owes whom, across many bills, in integer cents.
 *
 * Sign convention: a positive balance means the member is *owed* money;
 * negative means they owe. Balances always sum to zero.
 */

export interface LedgerEntry {
  memberId: string;
  /** Positive = this member is owed. Negative = this member owes. */
  deltaCents: number;
}

export interface BillLedgerInput {
  /** The member who fronted the money. */
  payerMemberId: string;
  /** Per-person shares of this bill, keyed by member id. */
  sharesByMemberId: Record<string, number>;
}

export interface SettlementInput {
  fromMemberId: string;
  toMemberId: string;
  amountCents: number;
}

export interface Transfer {
  fromMemberId: string;
  toMemberId: string;
  amountCents: number;
}

/**
 * One bill becomes a set of ledger deltas: the payer is owed everything they
 * covered on other people's behalf; everyone else owes their own share.
 */
export function ledgerForBill(input: BillLedgerInput): LedgerEntry[] {
  const entries = new Map<string, number>();
  const add = (memberId: string, delta: number) =>
    entries.set(memberId, (entries.get(memberId) ?? 0) + delta);

  let totalPaid = 0;
  for (const [memberId, share] of Object.entries(input.sharesByMemberId)) {
    totalPaid += share;
    add(memberId, -share);
  }
  add(input.payerMemberId, totalPaid);

  return [...entries].map(([memberId, deltaCents]) => ({ memberId, deltaCents }));
}

export function netBalances(
  ledgers: LedgerEntry[][],
  settlements: SettlementInput[] = [],
): Record<string, number> {
  const balances: Record<string, number> = {};
  const add = (memberId: string, delta: number) => {
    balances[memberId] = (balances[memberId] ?? 0) + delta;
  };

  for (const ledger of ledgers) {
    for (const entry of ledger) add(entry.memberId, entry.deltaCents);
  }

  // Paying someone back reduces what you owe and what they're owed.
  for (const s of settlements) {
    add(s.fromMemberId, s.amountCents);
    add(s.toMemberId, -s.amountCents);
  }

  return balances;
}

/**
 * Collapse a web of balances into the fewest transfers that settle it.
 *
 * Greedy largest-debtor-to-largest-creditor. This is not guaranteed minimal in
 * the general case (that problem is NP-hard), but it is optimal for the shapes
 * real dinner groups produce, and it reliably turns "A owes B $12, B owes C $12"
 * into the single transfer "A pays C $12".
 *
 * Deterministic: ties are broken by member id.
 */
export function simplifyDebts(balances: Record<string, number>): Transfer[] {
  const creditors = Object.entries(balances)
    .filter(([, v]) => v > 0)
    .map(([memberId, amount]) => ({ memberId, amount }))
    .sort((a, b) => b.amount - a.amount || (a.memberId < b.memberId ? -1 : 1));

  const debtors = Object.entries(balances)
    .filter(([, v]) => v < 0)
    .map(([memberId, amount]) => ({ memberId, amount: -amount }))
    .sort((a, b) => b.amount - a.amount || (a.memberId < b.memberId ? -1 : 1));

  const transfers: Transfer[] = [];
  let ci = 0;
  let di = 0;

  while (ci < creditors.length && di < debtors.length) {
    const creditor = creditors[ci]!;
    const debtor = debtors[di]!;
    const amount = Math.min(creditor.amount, debtor.amount);

    if (amount > 0) {
      transfers.push({
        fromMemberId: debtor.memberId,
        toMemberId: creditor.memberId,
        amountCents: amount,
      });
    }

    creditor.amount -= amount;
    debtor.amount -= amount;
    if (creditor.amount === 0) ci++;
    if (debtor.amount === 0) di++;
  }

  return transfers;
}

/** Lowercased, punctuation- and space-collapsed. Used to suggest identity matches. */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
