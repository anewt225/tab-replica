"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Receipt, Rule, TotalRow } from "@/components/Receipt";
import { formatCents, parseCents, centsToDecimalString } from "@/lib/money";
import type { SerializedBill } from "@/lib/bills";

interface DraftItem {
  id?: string;
  key: string;
  description: string;
  quantity: number;
  totalCents: number;
  category: "item" | "discount" | "fee";
}

/**
 * The review screen. OCR output is a first draft, and this screen is built on
 * that assumption: every figure is editable, and the bill cannot move on until
 * the parts add up to the printed total.
 */
export function ReviewEditor({ bill }: { bill: SerializedBill }) {
  const router = useRouter();

  const [items, setItems] = useState<DraftItem[]>(() =>
    bill.lineItems.map((item, index) => ({
      id: item.id,
      key: item.id ?? `new-${index}`,
      description: item.description,
      quantity: item.quantity,
      totalCents: item.totalCents,
      category: item.category as DraftItem["category"],
    })),
  );
  const [taxCents, setTaxCents] = useState(bill.taxCents);
  const [tipCents, setTipCents] = useState(bill.tipCents);
  const [totalCents, setTotalCents] = useState(bill.totalCents);
  const [merchant, setMerchant] = useState(bill.merchant ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const itemsTotal = useMemo(
    () => items.reduce((sum, item) => sum + item.totalCents, 0),
    [items],
  );
  const computedTotal = itemsTotal + taxCents + tipCents;
  const discrepancy = totalCents - computedTotal;
  const balanced = discrepancy === 0;

  function update(key: string, patch: Partial<DraftItem>) {
    setItems((current) =>
      current.map((item) => (item.key === key ? { ...item, ...patch } : item)),
    );
  }

  function addItem() {
    setItems((current) => [
      ...current,
      {
        key: `new-${Date.now()}`,
        description: "",
        quantity: 1,
        totalCents: 0,
        category: "item",
      },
    ]);
  }

  /** Turn an unexplained gap into a real line rather than fudging the math. */
  function absorbDiscrepancy() {
    setItems((current) => [
      ...current,
      {
        key: `new-${Date.now()}`,
        description: discrepancy > 0 ? "Unaccounted charge" : "Unaccounted credit",
        quantity: 1,
        totalCents: discrepancy,
        category: discrepancy > 0 ? "fee" : "discount",
      },
    ]);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const cleaned = items
        .filter((item) => item.description.trim() !== "" || item.totalCents !== 0)
        .map((item) => ({
          ...(item.id ? { id: item.id } : {}),
          description: item.description.trim() || "Item",
          quantity: item.quantity,
          // Unit price is derived; nobody wants to key it in twice.
          unitPriceCents: Math.round(item.totalCents / Math.max(1, item.quantity)),
          totalCents: item.totalCents,
          category: item.category,
        }));

      const itemsResponse = await fetch(`/api/bills/${bill.slug}/items`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items: cleaned }),
      });
      if (!itemsResponse.ok) {
        throw new Error((await itemsResponse.json()).error ?? "Could not save items.");
      }

      const billResponse = await fetch(`/api/bills/${bill.slug}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          merchant: merchant.trim() || null,
          taxCents,
          tipCents,
          totalCents,
        }),
      });
      if (!billResponse.ok) {
        throw new Error((await billResponse.json()).error ?? "Could not save the bill.");
      }

      router.push(`/bill/${bill.slug}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save.");
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {bill.ocrStatus === "failed" && (
        <Callout tone="stamp" title="Couldn't read that one">
          {bill.ocrError ?? "The receipt could not be transcribed."} You can still
          type the items in by hand below.
        </Callout>
      )}

      {bill.ocrConfidence === "low" && bill.ocrStatus === "done" && (
        <Callout tone="stamp" title="Check these figures">
          The receipt was hard to read, so treat every number below as a guess
          until you&apos;ve compared it against the paper.
        </Callout>
      )}

      <Receipt className="rise">
        <div className="px-5 pb-3 text-center">
          <input
            value={merchant}
            onChange={(event) => setMerchant(event.target.value)}
            placeholder="Where was this?"
            aria-label="Merchant name"
            className="w-full bg-transparent text-center font-display text-[27px] leading-tight tracking-tight outline-none placeholder:text-ink-faint/60"
          />
          <p className="mt-1 text-[11px] uppercase tracking-[0.2em] text-ink-faint">
            Check the lines · tap any figure to fix it
          </p>
        </div>

        <Rule />

        <ul className="py-1">
          {items.map((item) => (
            <li
              key={item.key}
              className="grid grid-cols-[1fr_auto_auto] items-center gap-2 px-5 py-1.5"
            >
              <input
                value={item.description}
                onChange={(event) => update(item.key, { description: event.target.value })}
                placeholder="Item"
                aria-label="Item description"
                className={`min-w-0 bg-transparent text-sm outline-none placeholder:text-ink-faint/60 ${
                  item.category === "discount" ? "text-mint" : ""
                }`}
              />
              <CentsInput
                value={item.totalCents}
                onChange={(cents) => update(item.key, { totalCents: cents })}
                label={`Price for ${item.description || "item"}`}
              />
              <button
                type="button"
                onClick={() =>
                  setItems((current) => current.filter((row) => row.key !== item.key))
                }
                aria-label={`Remove ${item.description || "item"}`}
                className="px-1 text-lg leading-none text-ink-faint transition-colors hover:text-stamp"
              >
                ×
              </button>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={addItem}
          className="mx-5 mb-2 text-[13px] tracking-wide text-carbon underline decoration-dotted underline-offset-4"
        >
          + Add a missing line
        </button>

        <Rule className="my-2" />

        <TotalRow label="Items" value={formatCents(itemsTotal, bill.currency)} muted />
        <EditableTotal label="Tax" value={taxCents} onChange={setTaxCents} />
        <EditableTotal label="Tip" value={tipCents} onChange={setTipCents} />

        <Rule className="my-2" />

        <EditableTotal
          label="Total on the receipt"
          value={totalCents}
          onChange={setTotalCents}
          emphasis
        />
      </Receipt>

      {!balanced && (
        <Callout tone="stamp" title="These don't add up yet">
          <p>
            The lines and tax and tip come to{" "}
            <strong className="tabular">{formatCents(computedTotal, bill.currency)}</strong>
            , but the receipt says{" "}
            <strong className="tabular">{formatCents(totalCents, bill.currency)}</strong>{" "}
            — a gap of{" "}
            <strong className="tabular">
              {formatCents(Math.abs(discrepancy), bill.currency)}
            </strong>
            .
          </p>
          <p className="mt-2">
            Usually a line was misread or missed entirely. Fix it above, or add
            the gap as its own line and split it with everyone else.
          </p>
          <button
            type="button"
            onClick={absorbDiscrepancy}
            className="mt-3 rounded-card border border-stamp px-3 py-1.5 text-[13px] font-medium text-stamp"
          >
            Add {formatCents(Math.abs(discrepancy), bill.currency)} as its own line
          </button>
        </Callout>
      )}

      {error && (
        <Callout tone="stamp" title="Couldn't save">
          {error}
        </Callout>
      )}

      <div className="sticky bottom-3 px-2">
        <button
          type="button"
          onClick={save}
          disabled={saving || !balanced}
          className="tap flex w-full items-center justify-center rounded-card bg-ink px-5 font-semibold tracking-wide text-paper shadow-lg transition-opacity disabled:opacity-40"
        >
          {saving
            ? "Saving…"
            : balanced
              ? "Looks right — start splitting"
              : "Fix the gap to continue"}
        </button>
      </div>
    </div>
  );
}

function EditableTotal({
  label,
  value,
  onChange,
  emphasis = false,
}: {
  label: string;
  value: number;
  onChange: (cents: number) => void;
  emphasis?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-5 py-1.5">
      <span
        className={
          emphasis
            ? "text-[13px] font-semibold uppercase tracking-[0.16em]"
            : "text-[13px] tracking-wide text-ink-soft"
        }
      >
        {label}
      </span>
      <CentsInput value={value} onChange={onChange} label={label} emphasis={emphasis} />
    </div>
  );
}

/**
 * A money field that keeps its own text while focused, so typing "12.5" doesn't
 * get reformatted to "12.50" under the cursor mid-keystroke.
 */
function CentsInput({
  value,
  onChange,
  label,
  emphasis = false,
}: {
  value: number;
  onChange: (cents: number) => void;
  label: string;
  emphasis?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? centsToDecimalString(value);

  return (
    <input
      inputMode="decimal"
      aria-label={label}
      value={shown}
      onFocus={(event) => {
        setDraft(centsToDecimalString(value));
        event.target.select();
      }}
      onChange={(event) => {
        setDraft(event.target.value);
        const cents = parseCents(event.target.value);
        if (cents !== null) onChange(cents);
      }}
      onBlur={() => setDraft(null)}
      className={`tabular w-24 shrink-0 rounded-sm bg-transparent px-1 py-0.5 text-right outline-none focus:bg-paper-sunk ${
        emphasis ? "text-lg font-semibold" : "text-sm"
      }`}
    />
  );
}

function Callout({
  tone,
  title,
  children,
}: {
  tone: "stamp" | "carbon";
  title: string;
  children: React.ReactNode;
}) {
  const styles =
    tone === "stamp"
      ? "border-stamp/30 bg-stamp-soft text-stamp"
      : "border-carbon/30 bg-carbon-soft text-carbon";
  return (
    <div
      role="alert"
      className={`rise mx-2 rounded-card border px-4 py-3 text-[13px] leading-relaxed ${styles}`}
    >
      <p className="mb-1 font-semibold tracking-wide">{title}</p>
      {children}
    </div>
  );
}
