import Link from "next/link";
import { desc, eq, inArray } from "drizzle-orm";
import { Receipt, Rule } from "@/components/Receipt";
import { db } from "@/lib/db/client";
import { bills, participants } from "@/lib/db/schema";
import { readDeviceId } from "@/lib/device";
import { formatCents } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function MyBillsPage() {
  const deviceId = await readDeviceId();
  const rows = deviceId ? await billsForDevice(deviceId) : [];

  return (
    <Receipt className="rise">
      <div className="px-5 pb-3">
        <h1 className="font-display text-[27px] leading-tight tracking-tight">
          Your bills
        </h1>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">
          Everything this browser has joined. No account needed — but clear your
          cookies and this list goes with them.
        </p>
      </div>
      <Rule />

      {rows.length === 0 ? (
        <div className="px-5 py-10 text-center">
          <p className="text-sm text-ink-soft">Nothing here yet.</p>
          <Link
            href="/"
            className="mt-3 inline-block text-[13px] text-carbon underline decoration-dotted underline-offset-4"
          >
            Split your first receipt
          </Link>
        </div>
      ) : (
        <ul>
          {rows.map((row) => (
            <li key={row.slug} className="border-b border-paper-edge last:border-0">
              <Link
                href={`/bill/${row.slug}`}
                className="tap flex items-center justify-between gap-3 px-5 hover:bg-paper-sunk"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">
                    {row.merchant ?? "Untitled receipt"}
                  </span>
                  <span className="block text-[11px] text-ink-faint">
                    {formatDay(row.purchasedAt ?? row.createdAt)}
                    {row.finalizedAt ? " · settled" : ""}
                  </span>
                </span>
                <span className="tabular shrink-0 text-sm">
                  {formatCents(row.totalCents, row.currency)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Receipt>
  );
}

async function billsForDevice(deviceId: string) {
  const mine = await db
    .select({ billId: participants.billId })
    .from(participants)
    .where(eq(participants.deviceId, deviceId));

  const ids = [...new Set(mine.map((row) => row.billId))];
  if (ids.length === 0) return [];

  return db
    .select({
      slug: bills.slug,
      merchant: bills.merchant,
      totalCents: bills.totalCents,
      currency: bills.currency,
      purchasedAt: bills.purchasedAt,
      createdAt: bills.createdAt,
      finalizedAt: bills.finalizedAt,
    })
    .from(bills)
    .where(inArray(bills.id, ids))
    .orderBy(desc(bills.createdAt))
    .limit(50);
}

function formatDay(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}
