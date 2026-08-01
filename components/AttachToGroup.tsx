"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

/**
 * Turn a one-off split into a running tab between the same people. Everyone
 * already on the bill becomes a group member, so this dinner counts toward
 * balances straight away.
 */
export function AttachToGroup({
  billSlug,
  groupId,
}: {
  billSlug: string;
  groupId: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdSlug, setCreatedSlug] = useState<string | null>(null);

  if (groupId && !createdSlug) {
    return (
      <p className="mx-2 text-center text-[13px] text-ink-faint">
        This bill is part of a group.{" "}
        <Link
          href={`/my-bills`}
          className="text-carbon underline decoration-dotted underline-offset-4"
        >
          See balances
        </Link>
      </p>
    );
  }

  if (createdSlug) {
    return (
      <p className="mx-2 text-center text-[13px] text-mint">
        Group created.{" "}
        <Link href={`/group/${createdSlug}`} className="underline underline-offset-4">
          See running balances
        </Link>
      </p>
    );
  }

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/groups", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), billSlug }),
      });
      if (!response.ok) {
        throw new Error((await response.json()).error ?? "Could not create the group.");
      }
      const { slug } = await response.json();
      setCreatedSlug(slug);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create the group.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mx-auto block text-[13px] text-carbon underline decoration-dotted underline-offset-4"
      >
        Eat with these people often? Keep a running tab
      </button>
    );
  }

  return (
    <form onSubmit={create} className="mx-2 rounded-card border border-paper-edge bg-paper p-4">
      <label htmlFor="group-name" className="block text-[13px] leading-relaxed text-ink-soft">
        Name the group, and future bills between you can net out into a single
        &ldquo;who owes whom&rdquo;.
      </label>
      <div className="mt-2 flex gap-2">
        <input
          id="group-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Thursday dinner crew"
          className="min-w-0 flex-1 rounded-card border border-paper-edge bg-paper-sunk px-3 py-2 text-sm outline-none focus:border-carbon"
        />
        <button
          type="submit"
          disabled={busy || !name.trim()}
          className="shrink-0 rounded-card bg-ink px-3 text-sm font-medium text-paper disabled:opacity-50"
        >
          {busy ? "…" : "Create"}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-[13px] text-stamp">
          {error}
        </p>
      )}
    </form>
  );
}
