import Anthropic from "@anthropic-ai/sdk";
import { RECEIPT_SCHEMA, type ExtractedReceipt } from "./schema";
import { EXTRACTION_PROMPT } from "./prompt";

/** Media types Claude accepts for image input. */
const IMAGE_MEDIA_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
] as const;

export type SupportedMediaType = (typeof IMAGE_MEDIA_TYPES)[number] | "application/pdf";

export function isSupportedMediaType(value: string): value is SupportedMediaType {
  return value === "application/pdf" || (IMAGE_MEDIA_TYPES as readonly string[]).includes(value);
}

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error(
        "ANTHROPIC_API_KEY is not set — receipt OCR is unavailable. " +
          "Add it to .env (see .env.example).",
      );
    }
    client = new Anthropic();
  }
  return client;
}

export interface ExtractionResult {
  receipt: ExtractedReceipt;
  usage: { inputTokens: number; outputTokens: number };
}

/**
 * One call does both OCR and itemization. Structured outputs guarantee the
 * shape, so the caller only has to judge the *content* — see `reconcile()` in
 * lib/split/compute.ts, which decides whether a human needs to look at it.
 */
export async function extractReceipt(params: {
  data: string; // base64, no data: prefix
  mediaType: SupportedMediaType;
}): Promise<ExtractionResult> {
  const { data, mediaType } = params;

  const source =
    mediaType === "application/pdf"
      ? ({
          type: "document" as const,
          source: { type: "base64" as const, media_type: "application/pdf" as const, data },
        })
      : ({
          type: "image" as const,
          source: { type: "base64" as const, media_type: mediaType, data },
        });

  const response = await anthropic().messages.create({
    model: "claude-opus-5",
    // Covers thinking (adaptive, on by default) plus a long itemized receipt.
    max_tokens: 8000,
    output_config: {
      effort: "medium",
      format: { type: "json_schema", schema: RECEIPT_SCHEMA },
    },
    messages: [
      {
        role: "user",
        // The document/image block goes before the text block — this ordering
        // is the documented one and measurably improves transcription.
        content: [source, { type: "text", text: EXTRACTION_PROMPT }],
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("The model declined to process this image.");
  }

  const text = response.content.find((block) => block.type === "text");
  if (!text || text.type !== "text") {
    throw new Error(
      `Extraction returned no text content (stop_reason: ${response.stop_reason}).`,
    );
  }

  return {
    receipt: JSON.parse(text.text) as ExtractedReceipt,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    },
  };
}

/**
 * Fold the model's output into the shape the database wants.
 *
 * `total_cents` is trusted as printed when present, because the printed total
 * is what the card was actually charged. Where the items don't reconcile
 * against it, the discrepancy is surfaced on the review screen rather than
 * quietly patched.
 */
export function toBillDraft(receipt: ExtractedReceipt) {
  const lineItems = receipt.line_items.map((item, index) => ({
    position: index,
    description: item.description.trim() || "Item",
    quantity: Number.isFinite(item.quantity) && item.quantity > 0 ? item.quantity : 1,
    unitPriceCents: Math.round(item.unit_price_cents),
    totalCents: Math.round(item.total_cents),
    category: item.category,
  }));

  const itemsTotal = lineItems.reduce((sum, li) => sum + li.totalCents, 0);
  const taxCents = Math.max(0, Math.round(receipt.tax_cents));
  const tipCents = Math.max(0, Math.round(receipt.tip_cents));

  return {
    merchant: receipt.merchant?.trim() || null,
    purchasedAt: parseDate(receipt.purchased_at),
    currency: /^[A-Z]{3}$/.test(receipt.currency) ? receipt.currency : "USD",
    subtotalCents: receipt.subtotal_cents ?? itemsTotal,
    taxCents,
    tipCents,
    totalCents: receipt.total_cents ?? itemsTotal + taxCents + tipCents,
    ocrConfidence: receipt.confidence,
    lineItems,
  };
}

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
