"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatCents } from "@/lib/money";

/** Marks a debt paid. Honour-system — no money moves through Tab. */
export function SettleUpButton({
  groupSlug,
  fromMemberId,
  toMemberId,
  amountCents,
}: {
  groupSlug: string;
  fromMemberId: string;
  toMemberId: string;
  amountCents: number;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function settle() {
    setBusy(true);
    await fetch(`/api/groups/${groupSlug}/settlements`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fromMemberId, toMemberId, amountCents }),
    });
    setBusy(false);
    setConfirming(false);
    router.refresh();
  }

  if (confirming) {
    return (
      <span className="flex shrink-0 gap-1">
        <button
          type="button"
          onClick={() => void settle()}
          disabled={busy}
          className="rounded-card bg-mint px-2 py-1 text-[11px] font-medium text-white disabled:opacity-50"
        >
          {busy ? "…" : "Confirm"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="rounded-card border border-paper-edge px-2 py-1 text-[11px] text-ink-faint"
        >
          Cancel
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      aria-label={`Mark ${formatCents(amountCents)} as paid`}
      className="shrink-0 rounded-card border border-paper-edge px-2 py-1 text-[11px] text-ink-soft transition-colors hover:border-mint hover:text-mint"
    >
      Settle
    </button>
  );
}
