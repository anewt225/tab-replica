import { notFound } from "next/navigation";
import { getBillBySlug, serializeBill } from "@/lib/bills";
import { ReviewEditor } from "./ReviewEditor";

export const dynamic = "force-dynamic";

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const view = await getBillBySlug(slug);
  if (!view) notFound();

  return <ReviewEditor bill={serializeBill(view, null)} />;
}
