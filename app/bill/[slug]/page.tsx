import { notFound, redirect } from "next/navigation";
import {
  findParticipantForDevice,
  getBillBySlug,
  serializeBill,
} from "@/lib/bills";
import { readDeviceId } from "@/lib/device";
import { ClaimBoard } from "./ClaimBoard";

export const dynamic = "force-dynamic";

export default async function BillPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const view = await getBillBySlug(slug);
  if (!view) notFound();

  // A bill that has never been reviewed has nothing to claim yet.
  if (view.lineItems.length === 0 && view.bill.ocrStatus !== "processing") {
    redirect(`/bill/${slug}/review`);
  }

  const deviceId = await readDeviceId();
  const viewer = await findParticipantForDevice(view.bill.id, deviceId);

  return <ClaimBoard initial={serializeBill(view, viewer?.id ?? null)} />;
}
