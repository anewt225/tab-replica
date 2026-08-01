/**
 * JSON Schema handed to Claude via `output_config.format`. Because this is a
 * structured output, the model physically cannot return malformed JSON or a
 * missing field — so there is no defensive parsing on the other side, only
 * business validation (does the arithmetic check out?).
 *
 * Written as a plain object rather than derived from Zod: the schema is static,
 * and hand-writing it avoids coupling extraction to a zod-to-json-schema
 * conversion layer that could silently emit unsupported keywords.
 */
export const RECEIPT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "merchant",
    "purchased_at",
    "currency",
    "line_items",
    "subtotal_cents",
    "tax_cents",
    "tip_cents",
    "total_cents",
    "confidence",
    "notes",
  ],
  properties: {
    merchant: {
      type: ["string", "null"],
      description: "Business name as printed. Null if not legible.",
    },
    purchased_at: {
      type: ["string", "null"],
      description:
        "ISO 8601 date or datetime of the transaction, e.g. 2026-07-31T19:42:00. Null if not printed or not legible.",
    },
    currency: {
      type: "string",
      description: "ISO 4217 code. Default to USD if no symbol indicates otherwise.",
    },
    line_items: {
      type: "array",
      description: "Every purchasable line printed on the receipt, in printed order.",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "description",
          "quantity",
          "unit_price_cents",
          "total_cents",
          "category",
        ],
        properties: {
          description: {
            type: "string",
            description: "Item name as printed, cleaned of register abbreviations only where unambiguous.",
          },
          quantity: {
            type: "integer",
            description: "Printed quantity. Use 1 when no quantity column exists.",
          },
          unit_price_cents: {
            type: "integer",
            description: "Price for one unit, in cents.",
          },
          total_cents: {
            type: "integer",
            description:
              "Extended line total in cents. Negative for discounts and voids.",
          },
          category: {
            type: "string",
            enum: ["item", "discount", "fee"],
            description:
              "'item' for anything ordered; 'discount' for comps, coupons and voids (negative total); 'fee' for service charges, delivery and surcharges.",
          },
        },
      },
    },
    subtotal_cents: {
      type: ["integer", "null"],
      description: "Printed subtotal in cents. Null if not printed.",
    },
    tax_cents: {
      type: "integer",
      description: "Total tax in cents. Sum all tax lines. 0 if none printed.",
    },
    tip_cents: {
      type: "integer",
      description:
        "Gratuity in cents, whether printed as auto-gratuity or handwritten. 0 if none.",
    },
    total_cents: {
      type: ["integer", "null"],
      description: "Printed grand total in cents. Null if not legible.",
    },
    confidence: {
      type: "string",
      enum: ["high", "medium", "low"],
      description:
        "How confident you are in the transcription overall. 'low' means a human should check every figure.",
    },
    notes: {
      type: ["string", "null"],
      description:
        "Anything a human reviewer needs to know: illegible regions, ambiguous lines, handwritten amendments, arithmetic that does not add up. Null if the receipt was clean.",
    },
  },
} as const;

export interface ExtractedLineItem {
  description: string;
  quantity: number;
  unit_price_cents: number;
  total_cents: number;
  category: "item" | "discount" | "fee";
}

export interface ExtractedReceipt {
  merchant: string | null;
  purchased_at: string | null;
  currency: string;
  line_items: ExtractedLineItem[];
  subtotal_cents: number | null;
  tax_cents: number;
  tip_cents: number;
  total_cents: number | null;
  confidence: "high" | "medium" | "low";
  notes: string | null;
}
