"use client";

import { useState } from "react";
import Link from "next/link";
import { Receipt, ReceiptHeader, Rule, TotalRow } from "@/components/Receipt";
import { ParticipantChip } from "@/components/ParticipantChip";
import { AttachToGroup } from "@/components/AttachToGroup";
import { useLiveBill } from "@/lib/useLiveBill";
import { formatCents } from "@/lib/money";
import {
  parseHandle,
  paymentNote,
  paymentUrl,
  PROVIDER_LABELS,
  type PaymentProvider,
} from "@/lib/payments/links";
import type { SerializedBill } from "@/lib/bills";

export function SummaryView({ initial }: { initial: SerializedBill }) {
  const { bill, refetch } = useLiveBill(initial.slug, initial);
  const [expanded, setExpanded] = useState<string | null>(
    bill.participants.find((p) => p.isViewer)?.id ?? null,
  );

  const viewer = bill.participants.find((p) => p.isViewer) ?? null;
  const payer = bill.participants.find((p) => p.id === bill.payerParticipantId) ?? null;
  const payerHandle = parseHandle(payer?.paymentHandle ?? null);
  const note = paymentNote(bill.merchant, bill.purchasedAt);

  // The invariant, surfaced. If this ever fails it's a bug, and showing a
  // warning beats quietly handing somebody a wrong number.
  const sumOfShares = bill.split.participants.reduce((sum, p) => sum + p.totalCents, 0);
  const settled = sumOfShares + bill.split.unallocatedCents === bill.split.computedTotalCents;

  return (
    <div className="space-y-4">
      <Receipt className="rise">
        <ReceiptHeader
          merchant={bill.merchant ?? "Untitled receipt"}
          subtitle="Who owes what"
        />
        <Rule />

        <ul>
          {[...bill.participants]
            .map((person) => ({
              person,
              share: bill.split.participants.find((p) => p.participantId === person.id),
            }))
            .sort((a, b) => (b.share?.totalCents ?? 0) - (a.share?.totalCents ?? 0))
            .map(({ person, share }) => {
              const isOpen = expanded === person.id;
              const owed = share?.totalCents ?? 0;
              const isPayer = person.id === bill.payerParticipantId;

              return (
                <li key={person.id} className="border-b border-paper-edge last:border-0">
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : person.id)}
                    aria-expanded={isOpen}
                    className="tap flex w-full items-center gap-3 px-5 text-left"
                  >
                    <ParticipantChip
                      name={person.displayName}
                      colorIndex={person.colorIndex}
                      size="md"
                      isViewer={person.isViewer}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {person.displayName}
                        {person.isViewer && (
                          <span className="ml-1.5 text-[11px] text-ink-faint">you</span>
                        )}
                      </span>
                      <span className="block text-[11px] text-ink-faint">
                        {isPayer
                          ? "paid the bill"
                          : `${share?.shares.length ?? 0} ${
                              (share?.shares.length ?? 0) === 1 ? "item" : "items"
                            }`}
                      </span>
                    </span>
                    <span className="tabular shrink-0 text-lg font-semibold">
                      {formatCents(owed, bill.currency)}
                    </span>
                  </button>

                  {isOpen && share && (
                    <div className="bg-paper-sunk px-5 py-3">
                      <ul className="space-y-1">
                        {share.shares.map((item) => {
                          const line = bill.lineItems.find((l) => l.id === item.lineItemId);
                          return (
                            <li
                              key={item.lineItemId}
                              className="flex justify-between gap-3 text-[13px] text-ink-soft"
                            >
                              <span className="min-w-0 truncate">
                                {line?.description ?? "Item"}
                                {item.claimantCount > 1 && (
                                  <span className="ml-1 text-ink-faint">
                                    ÷{item.claimantCount}
                                  </span>
                                )}
                              </span>
                              <span className="tabular shrink-0">
                                {formatCents(item.shareCents, bill.currency)}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                      <hr className="rule my-2" />
                      <dl className="space-y-1 text-[13px]">
                        <Line label="Items" value={share.itemsCents} currency={bill.currency} />
                        {share.adjustmentsCents !== 0 && (
                          <Line
                            label="Discounts & fees"
                            value={share.adjustmentsCents}
                            currency={bill.currency}
                          />
                        )}
                        <Line
                          label="Tax (their share)"
                          value={share.taxCents}
                          currency={bill.currency}
                        />
                        <Line
                          label="Tip (their share)"
                          value={share.tipCents}
                          currency={bill.currency}
                        />
                      </dl>

                      {!isPayer && payerHandle && owed > 0 && (
                        <a
                          href={
                            paymentUrl({ handle: payerHandle, amountCents: owed, note }) ??
                            undefined
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          className="tap mt-3 flex items-center justify-center rounded-card bg-ink px-4 text-sm font-semibold text-paper"
                        >
                          Pay {payer?.displayName} {formatCents(owed, bill.currency)} with{" "}
                          {PROVIDER_LABELS[payerHandle.provider]}
                        </a>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
        </ul>

        <Rule className="my-2" />
        <TotalRow
          label="Everyone's shares"
          value={formatCents(sumOfShares, bill.currency)}
          muted
        />
        <TotalRow
          label="Receipt total"
          value={formatCents(bill.split.computedTotalCents, bill.currency)}
          emphasis
        />
      </Receipt>

      {!settled ? (
        <p
          role="alert"
          className="mx-2 rounded-card border border-stamp/30 bg-stamp-soft px-4 py-3 text-[13px] text-stamp"
        >
          These shares don&apos;t add up to the receipt total. Don&apos;t pay from
          this screen — please report it.
        </p>
      ) : bill.split.unallocatedCents !== 0 ? (
        <p className="mx-2 rounded-card border border-stamp/30 bg-stamp-soft px-4 py-3 text-[13px] leading-relaxed text-stamp">
          <span className="tabular">
            {formatCents(bill.split.unallocatedCents, bill.currency)}
          </span>{" "}
          is still unclaimed, so these totals don&apos;t cover the whole bill yet.{" "}
          <Link href={`/bill/${bill.slug}`} className="underline underline-offset-2">
            Go back and claim it
          </Link>
          .
        </p>
      ) : (
        <p className="mx-2 flex items-center justify-center gap-2 text-[13px] text-mint">
          <span aria-hidden="true">✓</span>
          Every cent accounted for.
        </p>
      )}

      <PayerPicker bill={bill} viewerId={viewer?.id ?? null} onSaved={refetch} />

      {viewer && <AttachToGroup billSlug={bill.slug} groupId={bill.groupId} />}

      <Link
        href={`/bill/${bill.slug}`}
        className="mx-2 block text-center text-[13px] text-carbon underline decoration-dotted underline-offset-4"
      >
        Back to the items
      </Link>
    </div>
  );
}

function Line({
  label,
  value,
  currency,
}: {
  label: string;
  value: number;
  currency: string;
}) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink-faint">{label}</dt>
      <dd className="tabular text-ink-soft">{formatCents(value, currency)}</dd>
    </div>
  );
}

/**
 * Who fronted the money, and where to send it. Only shown to people who have
 * joined — there is nothing here for a passer-by with the link.
 */
function PayerPicker({
  bill,
  viewerId,
  onSaved,
}: {
  bill: SerializedBill;
  viewerId: string | null;
  onSaved: () => Promise<void>;
}) {
  const viewer = bill.participants.find((p) => p.id === viewerId);
  const existing = parseHandle(viewer?.paymentHandle ?? null);
  const [provider, setProvider] = useState<PaymentProvider>(existing?.provider ?? "venmo");
  const [handle, setHandle] = useState(existing?.handle ?? "");
  const [busy, setBusy] = useState(false);

  if (!viewer) return null;

  const isPayer = bill.payerParticipantId === viewer.id;

  async function claimPayer() {
    setBusy(true);
    await fetch(`/api/bills/${bill.slug}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ payerParticipantId: isPayer ? null : viewer!.id }),
    });
    await onSaved();
    setBusy(false);
  }

  async function saveHandle() {
    setBusy(true);
    await fetch(`/api/bills/${bill.slug}/participants`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        displayName: viewer!.displayName,
        paymentHandle: handle.trim() ? `${provider}:${handle.trim()}` : null,
      }),
    });
    await onSaved();
    setBusy(false);
  }

  return (
    <div className="mx-2 rounded-card border border-paper-edge bg-paper p-4">
      <p className="text-[11px] uppercase tracking-[0.18em] text-ink-faint">
        {bill.payerParticipantId ? "Paying back" : "Who paid?"}
      </p>

      <button
        type="button"
        onClick={() => void claimPayer()}
        disabled={busy}
        className="tap mt-2 flex w-full items-center justify-center rounded-card border border-paper-edge px-4 text-sm transition-colors hover:border-ink-faint disabled:opacity-50"
      >
        {isPayer ? "I didn't pay after all" : "I put this on my card"}
      </button>

      {isPayer && (
        <div className="mt-3">
          <p className="text-[13px] leading-relaxed text-ink-soft">
            Add your handle and everyone else gets a button that opens their app
            with the right amount already filled in.
          </p>
          <div className="mt-2 flex gap-2">
            <select
              value={provider}
              onChange={(event) => setProvider(event.target.value as PaymentProvider)}
              aria-label="Payment provider"
              className="rounded-card border border-paper-edge bg-paper-sunk px-2 py-2 text-sm"
            >
              {Object.entries(PROVIDER_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <input
              value={handle}
              onChange={(event) => setHandle(event.target.value)}
              placeholder="your-handle"
              aria-label="Payment handle"
              className="min-w-0 flex-1 rounded-card border border-paper-edge bg-paper-sunk px-3 py-2 text-sm outline-none focus:border-carbon"
            />
            <button
              type="button"
              onClick={() => void saveHandle()}
              disabled={busy}
              className="shrink-0 rounded-card bg-ink px-3 text-sm font-medium text-paper disabled:opacity-50"
            >
              Save
            </button>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
            No money moves through Tab — the button just opens{" "}
            {PROVIDER_LABELS[provider]} with the amount pre-filled.
          </p>
        </div>
      )}
    </div>
  );
}
