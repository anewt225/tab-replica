import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { groups, settlements } from "@/lib/db/schema";

export const runtime = "nodejs";

const bodySchema = z.object({
  fromMemberId: z.uuid(),
  toMemberId: z.uuid(),
  amountCents: z.number().int().positive().max(100_000_000),
  note: z.string().trim().max(200).optional(),
});

/**
 * Record a payback. Honour-system, exactly like Splitwise — Tab never sees the
 * money, it just stops asking about that debt.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid settlement." }, { status: 400 });
  }
  if (parsed.data.fromMemberId === parsed.data.toMemberId) {
    return NextResponse.json(
      { error: "You can't settle up with yourself." },
      { status: 400 },
    );
  }

  const group = await db.query.groups.findFirst({ where: eq(groups.slug, slug) });
  if (!group) return NextResponse.json({ error: "Group not found." }, { status: 404 });

  await db.insert(settlements).values({ groupId: group.id, ...parsed.data });
  return NextResponse.json({ ok: true }, { status: 201 });
}
