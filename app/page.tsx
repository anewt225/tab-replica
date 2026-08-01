import Link from "next/link";
import { desc, eq, inArray } from "drizzle-orm";
import { ReceiptDropzone } from "@/components/ReceiptDropzone";
import { Receipt, Rule } from "@/components/Receipt";
import { db } from "@/lib/db/client";
import { bills, participants } from "@/lib/db/schema";
import { readDeviceId } from "@/lib/device";
import { formatCents } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const recent = await recentBills();

  return (
    <div className="space-y-6">
      <Receipt className="rise">
        <ReceiptDropzone />
      </Receipt>

      <ol className="grid grid-cols-3 gap-2 px-2">
        {[
          ["01", "Snap it", "One photo of the whole receipt"],
          ["02", "Send the link", "Everyone opens it on their own phone"],
          ["03", "Tap what you had", "Tax and tip split proportionally"],
        ].map(([step, title, detail], index) => (
          <li
            key={step}
            className="rise rounded-card border border-paper-edge bg-paper p-3"
            style={{ animationDelay: `${120 + index * 70}ms` }}
          >
            <span className="tabular text-[11px] font-semibold text-stamp">{step}</span>
            <p className="mt-1 text-[13px] leading-tight font-semibold">{title}</p>
            <p className="mt-1 text-[11px] leading-snug text-ink-faint">{detail}</p>
          </li>
        ))}
      </ol>

      {recent.length > 0 && (
        <Receipt className="rise" >
          <p className="px-5 pb-2 text-[11px] uppercase tracking-[0.2em] text-ink-faint">
            Picking up where you left off
          </p>
          <Rule />
          <ul>
            {recent.map((bill) => (
              <li key={bill.slug}>
                <Link
                  href={`/bill/${bill.slug}`}
                  className="tap flex items-center justify-between gap-3 px-5 hover:bg-paper-sunk"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {bill.merchant ?? "Untitled receipt"}
                    </span>
                    <span className="block text-[11px] text-ink-faint">
                      {formatDay(bill.purchasedAt ?? bill.createdAt)}
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

async function recentBills() {
  const deviceId = await readDeviceId();
  if (!deviceId) return [];

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
    })
    .from(bills)
    .where(inArray(bills.id, ids))
    .orderBy(desc(bills.createdAt))
    .limit(3);
}

function formatDay(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}
