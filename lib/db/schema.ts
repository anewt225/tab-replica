import {
  pgTable,
  text,
  integer,
  timestamp,
  jsonb,
  uuid,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

/**
 * Money is stored as integer cents, everywhere, without exception.
 * Floats are never used for currency in this codebase — not in the DB, not in
 * the API payloads, not in the OCR output. Conversion to dollars happens once,
 * at render time, in `lib/money.ts`.
 */

export const groups = pgTable("groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** A person who recurs across bills within a group. */
export const groupMembers = pgTable(
  "group_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    displayName: text("display_name").notNull(),
    /** Lowercased, punctuation-stripped — used to suggest identity matches. */
    normalizedName: text("normalized_name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("group_members_group_name_idx").on(t.groupId, t.normalizedName)],
);

export const bills = pgTable(
  "bills",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Short URL-safe id — this is what people text to each other. */
    slug: text("slug").notNull().unique(),
    groupId: uuid("group_id").references(() => groups.id, {
      onDelete: "set null",
    }),

    merchant: text("merchant"),
    purchasedAt: timestamp("purchased_at", { withTimezone: true }),
    currency: text("currency").notNull().default("USD"),

    subtotalCents: integer("subtotal_cents").notNull().default(0),
    taxCents: integer("tax_cents").notNull().default(0),
    tipCents: integer("tip_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull().default(0),

    imageUrl: text("image_url"),
    /** 'pending' | 'processing' | 'done' | 'failed' */
    ocrStatus: text("ocr_status").notNull().default("pending"),
    ocrError: text("ocr_error"),
    /** Raw model output, kept verbatim for debugging and prompt iteration. */
    ocrRaw: jsonb("ocr_raw"),
    ocrConfidence: text("ocr_confidence"),

    /** Who fronted the money. Set on the review screen. */
    payerParticipantId: uuid("payer_participant_id"),

    /**
     * Monotonic counter bumped on every mutation. Clients poll
     * GET /api/bills/[slug]/version and refetch when it changes — this single
     * integer is the entire live-sync mechanism.
     */
    version: integer("version").notNull().default(1),

    /** Once finalized, claims are frozen and the summary is authoritative. */
    finalizedAt: timestamp("finalized_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("bills_group_idx").on(t.groupId)],
);

/** 'item' | 'discount' (negative cents) | 'fee' */
export const lineItems = pgTable(
  "line_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    billId: uuid("bill_id")
      .notNull()
      .references(() => bills.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    description: text("description").notNull(),
    quantity: integer("quantity").notNull().default(1),
    unitPriceCents: integer("unit_price_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull().default(0),
    category: text("category").notNull().default("item"),
  },
  (t) => [index("line_items_bill_idx").on(t.billId, t.position)],
);

export const participants = pgTable(
  "participants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    billId: uuid("bill_id")
      .notNull()
      .references(() => bills.id, { onDelete: "cascade" }),
    groupMemberId: uuid("group_member_id").references(() => groupMembers.id, {
      onDelete: "set null",
    }),
    displayName: text("display_name").notNull(),
    /** Opaque per-browser id from a signed cookie. No accounts, no passwords. */
    deviceId: text("device_id"),
    /** Index into the palette in lib/colors.ts. */
    colorIndex: integer("color_index").notNull().default(0),
    /** e.g. "venmo:alexnewton" — set by the payer so others can pay them. */
    paymentHandle: text("payment_handle"),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("participants_bill_idx").on(t.billId),
    index("participants_device_idx").on(t.deviceId),
  ],
);

/**
 * A participant claiming a share of a line item. Multiple claims on the same
 * item split it; `weight` handles uneven splits ("I had 2 of the 3 beers").
 */
export const claims = pgTable(
  "claims",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    lineItemId: uuid("line_item_id")
      .notNull()
      .references(() => lineItems.id, { onDelete: "cascade" }),
    participantId: uuid("participant_id")
      .notNull()
      .references(() => participants.id, { onDelete: "cascade" }),
    weight: integer("weight").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("claims_item_participant_idx").on(t.lineItemId, t.participantId),
  ],
);

/** A recorded "I paid you back" that offsets a group balance. */
export const settlements = pgTable(
  "settlements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    fromMemberId: uuid("from_member_id")
      .notNull()
      .references(() => groupMembers.id, { onDelete: "cascade" }),
    toMemberId: uuid("to_member_id")
      .notNull()
      .references(() => groupMembers.id, { onDelete: "cascade" }),
    amountCents: integer("amount_cents").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("settlements_group_idx").on(t.groupId)],
);

export type Group = typeof groups.$inferSelect;
export type GroupMember = typeof groupMembers.$inferSelect;
export type Bill = typeof bills.$inferSelect;
export type LineItem = typeof lineItems.$inferSelect;
export type Participant = typeof participants.$inferSelect;
export type Claim = typeof claims.$inferSelect;
export type Settlement = typeof settlements.$inferSelect;
