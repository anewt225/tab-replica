import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { bills } from "@/lib/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The poll target for live sync. Deliberately tiny — one indexed column lookup.
 * Clients hit this every couple of seconds and only refetch the full bill when
 * the number changes.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const [row] = await db
    .select({ version: bills.version })
    .from(bills)
    .where(eq(bills.slug, slug))
    .limit(1);

  if (!row) return NextResponse.json({ error: "Bill not found." }, { status: 404 });

  return NextResponse.json(
    { version: row.version },
    { headers: { "cache-control": "no-store" } },
  );
}
