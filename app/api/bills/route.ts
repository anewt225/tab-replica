import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { bills, lineItems } from "@/lib/db/schema";
import { newSlug } from "@/lib/bills";
import { ensureDeviceId } from "@/lib/device";
import { storeReceipt } from "@/lib/storage";
import { extractReceipt, isSupportedMediaType, toBillDraft } from "@/lib/ocr/extract";

export const runtime = "nodejs";
// Opus reading a dense receipt can take a while; don't cut it off at the default.
export const maxDuration = 120;

const MAX_BYTES = 12 * 1024 * 1024;

/**
 * Upload a receipt and get back a bill. OCR runs inline rather than as a
 * background job: it takes a few seconds, the user is staring at a spinner
 * anyway, and a queue would be a lot of moving parts for one API call.
 */
export async function POST(request: Request) {
  const deviceId = await ensureDeviceId();

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data." }, { status: 400 });
  }

  const file = form.get("receipt");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No receipt file was included." }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "That file is empty." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "That file is larger than 12 MB. Try a photo instead of a scan." },
      { status: 413 },
    );
  }

  const mediaType = file.type || "image/jpeg";
  if (!isSupportedMediaType(mediaType)) {
    return NextResponse.json(
      { error: `Unsupported file type "${mediaType}". Use a JPEG, PNG, WebP or PDF.` },
      { status: 415 },
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const slug = newSlug();

  const extension = mediaType === "application/pdf" ? "pdf" : mediaType.split("/")[1];
  let imageUrl: string | null = null;
  try {
    imageUrl = await storeReceipt({
      filename: `${slug}.${extension}`,
      contentType: mediaType,
      bytes,
    });
  } catch (error) {
    // Losing the image copy is not worth failing the whole upload over — the
    // extracted data is what matters, and the user still has the paper receipt.
    console.error("Receipt storage failed:", error);
  }

  const [created] = await db
    .insert(bills)
    .values({ slug, imageUrl, ocrStatus: "processing" })
    .returning();

  if (!created) {
    return NextResponse.json({ error: "Could not create the bill." }, { status: 500 });
  }

  try {
    const { receipt } = await extractReceipt({
      data: Buffer.from(bytes).toString("base64"),
      mediaType,
    });
    const draft = toBillDraft(receipt);

    await db.transaction(async (tx) => {
      await tx
        .update(bills)
        .set({
          merchant: draft.merchant,
          purchasedAt: draft.purchasedAt,
          currency: draft.currency,
          subtotalCents: draft.subtotalCents,
          taxCents: draft.taxCents,
          tipCents: draft.tipCents,
          totalCents: draft.totalCents,
          ocrStatus: "done",
          ocrConfidence: draft.ocrConfidence,
          ocrRaw: receipt,
        })
        .where(eq(bills.id, created.id));

      if (draft.lineItems.length > 0) {
        await tx
          .insert(lineItems)
          .values(draft.lineItems.map((item) => ({ ...item, billId: created.id })));
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Extraction failed.";
    console.error("OCR failed:", error);
    await db
      .update(bills)
      .set({ ocrStatus: "failed", ocrError: message })
      .where(eq(bills.id, created.id));
    // 200 with a failed status: the bill exists and the user can key it in by
    // hand on the review screen, which beats losing the upload entirely.
    return NextResponse.json({ slug, ocrStatus: "failed", error: message });
  }

  return NextResponse.json({ slug, ocrStatus: "done", deviceId });
}
