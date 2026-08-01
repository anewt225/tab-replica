import { notFound } from "next/navigation";
import {
  findParticipantForDevice,
  getBillBySlug,
  serializeBill,
} from "@/lib/bills";
import { readDeviceId } from "@/lib/device";
import { SummaryView } from "./SummaryView";

export const dynamic = "force-dynamic";

export default async function SummaryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const view = await getBillBySlug(slug);
  if (!view) notFound();

  const deviceId = await readDeviceId();
  const viewer = await findParticipantForDevice(view.bill.id, deviceId);

  return <SummaryView initial={serializeBill(view, viewer?.id ?? null)} />;
}
