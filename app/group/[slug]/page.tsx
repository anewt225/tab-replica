import { notFound } from "next/navigation";
import Link from "next/link";
import { Receipt, Rule } from "@/components/Receipt";
import { ParticipantChip } from "@/components/ParticipantChip";
import { getGroupSummary, memberName } from "@/lib/groups";
import { formatCents } from "@/lib/money";
import { SettleUpButton } from "./SettleUpButton";

export const dynamic = "force-dynamic";

export default async function GroupPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const summary = await getGroupSummary(slug);
  if (!summary) notFound();

  const { group, members, balances, transfers, bills, skipped } = summary;
  const allSquare = transfers.length === 0;

  return (
    <div className="space-y-4">
      <Receipt className="rise">
        <div className="px-5 pb-3 text-center">
          <h1 className="font-display text-[27px] leading-tight tracking-tight">
            {group.name}
          </h1>
          <p className="mt-1 text-[11px] uppercase tracking-[0.2em] text-ink-faint">
            {members.length} {members.length === 1 ? "person" : "people"} ·{" "}
            {bills.length} {bills.length === 1 ? "bill" : "bills"}
          </p>
        </div>
        <Rule />

        <p className="px-5 pt-3 pb-1 text-[11px] uppercase tracking-[0.2em] text-ink-faint">
          Settling up
        </p>

        {allSquare ? (
          <p className="px-5 py-6 text-center text-sm text-mint">
            Everyone&apos;s square.
          </p>
        ) : (
          <ul className="pb-2">
            {transfers.map((transfer) => (
              <li
                key={`${transfer.fromMemberId}-${transfer.toMemberId}`}
                className="flex items-center gap-3 px-5 py-2.5"
              >
                <ParticipantChip
                  name={memberName(members, transfer.fromMemberId)}
                  colorIndex={members.findIndex((m) => m.id === transfer.fromMemberId)}
                  size="sm"
                />
                <span className="min-w-0 flex-1 text-[13px] leading-snug">
                  <strong className="font-semibold">
                    {memberName(members, transfer.fromMemberId)}
                  </strong>{" "}
                  <span className="text-ink-faint">pays</span>{" "}
                  <strong className="font-semibold">
                    {memberName(members, transfer.toMemberId)}
                  </strong>
                </span>
                <span className="tabular shrink-0 text-sm font-semibold">
                  {formatCents(transfer.amountCents)}
                </span>
                <SettleUpButton
                  groupSlug={group.slug}
                  fromMemberId={transfer.fromMemberId}
                  toMemberId={transfer.toMemberId}
                  amountCents={transfer.amountCents}
                />
              </li>
            ))}
          </ul>
        )}

        <Rule className="my-1" />

        <p className="px-5 pt-3 pb-1 text-[11px] uppercase tracking-[0.2em] text-ink-faint">
          Running balances
        </p>
        <ul className="pb-2">
          {members.map((member, index) => {
            const balance = balances[member.id] ?? 0;
            return (
              <li
                key={member.id}
                className="flex items-center gap-3 px-5 py-2"
              >
                <ParticipantChip
                  name={member.displayName}
                  colorIndex={index}
                  size="sm"
                />
                <span className="min-w-0 flex-1 truncate text-sm">
                  {member.displayName}
                </span>
                <span
                  className={`tabular text-sm ${
                    balance > 0
                      ? "text-mint"
                      : balance < 0
                        ? "text-stamp"
                        : "text-ink-faint"
                  }`}
                >
                  {balance === 0
                    ? "settled"
                    : balance > 0
                      ? `owed ${formatCents(balance)}`
                      : `owes ${formatCents(-balance)}`}
                </span>
              </li>
            );
          })}
        </ul>
      </Receipt>

      {skipped.length > 0 && (
        <div className="mx-2 rounded-card border border-stamp/30 bg-stamp-soft px-4 py-3 text-[13px] leading-relaxed text-stamp">
          <p className="font-semibold">Not counted yet</p>
          <ul className="mt-1 space-y-1">
            {skipped.map((bill) => (
              <li key={bill.slug}>
                <Link href={`/bill/${bill.slug}`} className="underline underline-offset-2">
                  {bill.merchant ?? "Untitled receipt"}
                </Link>{" "}
                — {bill.reason}.
              </li>
            ))}
          </ul>
        </div>
      )}

      {bills.length > 0 && (
        <Receipt>
          <p className="px-5 pb-2 text-[11px] uppercase tracking-[0.2em] text-ink-faint">
            History
          </p>
          <Rule />
          <ul>
            {bills.map((bill) => (
              <li key={bill.slug} className="border-b border-paper-edge last:border-0">
                <Link
                  href={`/bill/${bill.slug}`}
                  className="tap flex items-center justify-between gap-3 px-5 hover:bg-paper-sunk"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {bill.merchant ?? "Untitled receipt"}
                    </span>
                    <span className="block text-[11px] text-ink-faint">
                      {bill.payerName ? `${bill.payerName} paid` : "no payer set"}
                    </span>
                  </span>
                  <span className="tabular shrink-0 text-sm text-ink-soft">
                    {formatCents(bill.totalCents, bill.currency)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Receipt>
      )}
    </div>
  );
}
