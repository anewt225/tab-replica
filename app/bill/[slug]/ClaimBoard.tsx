"use client";

import { useState } from "react";
import Link from "next/link";
import { Receipt, ReceiptHeader, Rule, TotalRow } from "@/components/Receipt";
import { ParticipantChip } from "@/components/ParticipantChip";
import { useLiveBill } from "@/lib/useLiveBill";
import { formatCents } from "@/lib/money";
import { colorFor } from "@/lib/colors";
import type { SerializedBill } from "@/lib/bills";

export function ClaimBoard({ initial }: { initial: SerializedBill }) {
  const { bill, refetch, mutate, connected } = useLiveBill(initial.slug, initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Set<string>>(new Set());

  const viewer = bill.participants.find((p) => p.isViewer) ?? null;
  const myShare = viewer
    ? (bill.split.participants.find((p) => p.participantId === viewer.id)?.totalCents ?? 0)
    : 0;
  const unclaimed = new Set(bill.split.unclaimedItemIds);

  async function toggleClaim(lineItemId: string) {
    if (!viewer) return;

    // Optimistic: the tap has to register instantly or it feels broken.
    const alreadyClaimed = bill.lineItems
      .find((item) => item.id === lineItemId)
      ?.claims.some((claim) => claim.participantId === viewer.id);

    setPending((current) => new Set(current).add(lineItemId));
    mutate((current) => ({
      ...current,
      lineItems: current.lineItems.map((item) =>
        item.id === lineItemId
          ? {
              ...item,
              claims: alreadyClaimed
                ? item.claims.filter((claim) => claim.participantId !== viewer.id)
                : [...item.claims, { participantId: viewer.id, weight: 1 }],
            }
          : item,
      ),
    }));

    try {
      const response = await fetch(`/api/bills/${bill.slug}/claims`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lineItemId }),
      });
      if (!response.ok) {
        throw new Error((await response.json()).error ?? "That didn't stick.");
      }
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That didn't stick.");
    } finally {
      // Refetch either way: on success to pick up recomputed totals, on failure
      // to roll the optimistic change back to the truth.
      await refetch();
      setPending((current) => {
        const next = new Set(current);
        next.delete(lineItemId);
        return next;
      });
    }
  }

  if (!viewer) {
    return <JoinPrompt bill={bill} onJoined={refetch} />;
  }

  return (
    <div className="space-y-4 pb-28">
      <Receipt className="rise">
        <ReceiptHeader
          merchant={bill.merchant ?? "Untitled receipt"}
          subtitle={`${bill.participants.length} at the table · tap what you had`}
        />

        <div className="flex flex-wrap items-center justify-center gap-1.5 px-5 pb-3">
          {bill.participants.map((person) => (
            <ParticipantChip
              key={person.id}
              name={person.displayName}
              colorIndex={person.colorIndex}
              isViewer={person.isViewer}
              title={person.isViewer ? `${person.displayName} (you)` : person.displayName}
            />
          ))}
          <ShareButton slug={bill.slug} merchant={bill.merchant} />
        </div>

        <Rule />

        <ul className="py-1">
          {bill.lineItems.map((item) => {
            const mine = item.claims.some((claim) => claim.participantId === viewer.id);
            const claimants = item.claims
              .map((claim) => bill.participants.find((p) => p.id === claim.participantId))
              .filter((p): p is NonNullable<typeof p> => Boolean(p));
            const isUnclaimed = unclaimed.has(item.id);
            const myShareOfItem =
              bill.split.participants
                .find((p) => p.participantId === viewer.id)
                ?.shares.find((share) => share.lineItemId === item.id)?.shareCents ?? null;

            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => void toggleClaim(item.id)}
                  aria-pressed={mine}
                  disabled={pending.has(item.id)}
                  className={`tap grid w-full grid-cols-[1fr_auto] items-center gap-3 border-l-[3px] px-5 text-left ${
                    mine
                      ? "border-l-[color:var(--claim-color)] bg-paper-sunk"
                      : isUnclaimed
                        ? "border-l-stamp/40 bg-stamp-soft/40"
                        : "border-l-transparent"
                  }`}
                  style={
                    mine
                      ? ({ "--claim-color": colorFor(viewer.colorIndex).bg } as React.CSSProperties)
                      : undefined
                  }
                >
                  <span className="min-w-0">
                    <span className="flex items-center gap-2">
                      <span
                        className={`truncate text-[15px] ${
                          item.category === "discount" ? "text-mint" : ""
                        } ${mine ? "font-semibold" : ""}`}
                      >
                        {item.quantity > 1 && (
                          <span className="tabular mr-1.5 text-ink-faint">
                            {item.quantity}×
                          </span>
                        )}
                        {item.description}
                      </span>
                    </span>

                    <span className="mt-1 flex h-5 items-center gap-1">
                      {claimants.length > 0 ? (
                        <>
                          {claimants.map((person) => (
                            <span key={person.id} className="stamp-in">
                              <ParticipantChip
                                name={person.displayName}
                                colorIndex={person.colorIndex}
                                size="xs"
                              />
                            </span>
                          ))}
                          {claimants.length > 1 && (
                            <span className="ml-1 text-[11px] text-ink-faint">
                              split {claimants.length} ways
                            </span>
                          )}
                        </>
                      ) : item.category === "item" ? (
                        <span className="text-[11px] tracking-wide text-stamp">
                          Nobody yet
                        </span>
                      ) : (
                        // Discounts and service charges spread across the table
                        // by default, so an empty one is expected, not a problem.
                        <span className="text-[11px] tracking-wide text-ink-faint">
                          {item.category === "discount"
                            ? "Shared by everyone"
                            : "Split with the table"}
                        </span>
                      )}
                    </span>
                  </span>

                  <span className="shrink-0 text-right">
                    <span
                      className={`tabular block text-sm ${
                        mine ? "font-semibold" : "text-ink-soft"
                      }`}
                    >
                      {formatCents(item.totalCents, bill.currency)}
                    </span>
                    {mine && myShareOfItem !== null && claimants.length > 1 && (
                      <span className="tabular block text-[11px] text-ink-faint">
                        you {formatCents(myShareOfItem, bill.currency)}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <Rule className="my-2" />
        <TotalRow label="Tax" value={formatCents(bill.taxCents, bill.currency)} muted />
        <TotalRow label="Tip" value={formatCents(bill.tipCents, bill.currency)} muted />
        <TotalRow
          label="Receipt total"
          value={formatCents(bill.totalCents, bill.currency)}
          emphasis
        />
      </Receipt>

      {bill.split.unclaimedItemIds.length > 0 && (
        <p className="mx-2 rounded-card border border-stamp/30 bg-stamp-soft px-4 py-3 text-[13px] leading-relaxed text-stamp">
          <strong>{bill.split.unclaimedItemIds.length}</strong>{" "}
          {bill.split.unclaimedItemIds.length === 1 ? "item hasn't" : "items haven't"} been
          claimed —{" "}
          <span className="tabular">
            {formatCents(bill.split.unallocatedCents, bill.currency)}
          </span>{" "}
          nobody is paying for yet. They&apos;ll be split evenly if you finish
          without claiming them.
        </p>
      )}

      {error && (
        <p role="alert" className="mx-2 text-[13px] text-stamp">
          {error}
        </p>
      )}

      <Link
        href={`/bill/${bill.slug}/review`}
        className="mx-2 block text-center text-[13px] text-carbon underline decoration-dotted underline-offset-4"
      >
        Something look wrong? Edit the receipt
      </Link>

      {/* Your own total, always in view. */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-paper-edge bg-paper/95 px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
        <div className="mx-auto flex max-w-xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.18em] text-ink-faint">
              Your share
              {!connected && (
                <span className="text-stamp normal-case tracking-normal">
                  · reconnecting
                </span>
              )}
            </p>
            <p className="tabular text-2xl leading-tight font-semibold">
              {formatCents(myShare, bill.currency)}
            </p>
          </div>
          <Link
            href={`/bill/${bill.slug}/summary`}
            className="tap flex items-center rounded-card bg-ink px-5 font-semibold tracking-wide text-paper"
          >
            Everyone&apos;s totals
          </Link>
        </div>
      </div>
    </div>
  );
}

function JoinPrompt({
  bill,
  onJoined,
}: {
  bill: SerializedBill;
  onJoined: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function join(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/bills/${bill.slug}/participants`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName: name.trim() }),
      });
      if (!response.ok) {
        throw new Error((await response.json()).error ?? "Could not join.");
      }
      await onJoined();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not join.");
      setBusy(false);
    }
  }

  return (
    <Receipt className="rise">
      <ReceiptHeader
        merchant={bill.merchant ?? "Untitled receipt"}
        subtitle={formatCents(bill.totalCents, bill.currency)}
      />
      <Rule />
      <form onSubmit={join} className="px-5 pt-5">
        <label htmlFor="name" className="block text-sm leading-relaxed text-ink-soft">
          {bill.participants.length > 0 ? (
            <>
              <span className="font-medium text-ink">
                {bill.participants.map((p) => p.displayName).join(", ")}
              </span>{" "}
              {bill.participants.length === 1 ? "is" : "are"} already here. What
              should we call you?
            </>
          ) : (
            "You're first. What should we call you?"
          )}
        </label>
        <input
          id="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoComplete="given-name"
          autoFocus
          placeholder="Your name"
          className="mt-3 w-full rounded-card border border-paper-edge bg-paper-sunk px-4 py-3 outline-none focus:border-carbon"
        />
        {error && (
          <p role="alert" className="mt-2 text-[13px] text-stamp">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy || !name.trim()}
          className="tap mt-3 flex w-full items-center justify-center rounded-card bg-ink px-5 font-semibold tracking-wide text-paper disabled:opacity-40"
        >
          {busy ? "Joining…" : "Start claiming items"}
        </button>
        <p className="mt-3 pb-2 text-center text-[11px] leading-relaxed text-ink-faint">
          No account, no password. This browser remembers you.
        </p>
      </form>
    </Receipt>
  );
}

function ShareButton({ slug, merchant }: { slug: string; merchant: string | null }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = `${window.location.origin}/bill/${slug}`;
    const text = merchant ? `Split the ${merchant} bill` : "Split this bill";

    if (navigator.share) {
      try {
        await navigator.share({ title: "Tab", text, url });
        return;
      } catch {
        // User dismissed the share sheet — fall through to copying.
      }
    }
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      type="button"
      onClick={() => void share()}
      className="ml-1 inline-flex h-7 items-center rounded-full border border-dashed border-ink-faint px-2.5 text-[11px] tracking-wide text-ink-soft transition-colors hover:border-ink hover:text-ink"
    >
      {copied ? "Link copied" : "+ Invite"}
    </button>
  );
}
