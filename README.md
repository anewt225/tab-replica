# Tab

Split a restaurant check without the arithmetic argument. Photograph the
receipt, send everyone the link, and each person taps what they had. Tax and tip
are split proportionally — if you had the $40 steak and I had the $8 salad, you
pay five times the tax, not half of it.

No accounts. No app to install. The link is the whole invitation.

## How it works

1. **Photograph the receipt.** Claude Opus 5 reads it and itemizes it in one
   pass — every line, plus tax, tip, discounts and service charges.
2. **Check the lines.** OCR is a first draft, so every figure is editable, and
   the bill won't move on until the items plus tax and tip equal the printed
   total.
3. **Everyone taps what they had.** Two people tapping the same item split it.
   Claims appear on everyone else's phone within a couple of seconds.
4. **Settle.** Per-person totals, and a button that opens Venmo, Cash App or
   PayPal with the exact amount filled in.

Eat with the same people often? Attach bills to a group and balances net out
across dinners, collapsing "A owes B, B owes C" into a single payment.

## Running it

Requires Node 22+, pnpm, and Docker (for local Postgres).

```bash
pnpm install
cp .env.example .env          # then add your ANTHROPIC_API_KEY
docker compose up -d          # Postgres on :5433
pnpm db:migrate
pnpm db:seed                  # optional: a sample bill to click through
pnpm dev
```

Only `ANTHROPIC_API_KEY` costs money — roughly $0.01–0.03 per receipt. Without
it everything works except OCR; you can still key a receipt in by hand.

### Deploying

Built for Vercel plus any Postgres (Neon, Vercel Postgres, Supabase). Set
`DATABASE_URL`, `ANTHROPIC_API_KEY`, `DEVICE_COOKIE_SECRET`
(`openssl rand -hex 32`), and `BLOB_READ_WRITE_TOKEN` for receipt image storage.
Without a blob token, images are written to `./uploads` — fine locally, not on
serverless.

## Design notes

**Money is integer cents, everywhere.** Not in the database, not in the API,
not in the model's output does a float touch a dollar amount. Conversion to
dollars happens once, at render.

**One invariant governs the split.** For any combination of items, claimants and
weights:

```
sum(every participant's total) + unallocated == sum(line items) + tax + tip
```

`lib/split/compute.ts` throws rather than return a number that violates it, and
the UI shows an error rather than a wrong total. Pennies that don't divide
evenly go to the largest fractional shares, tie-broken by participant id, so the
same bill always produces the same answer regardless of database row order.
`tests/split.property.test.ts` checks this against thousands of randomized bills.

**Unclaimed items are loud.** Money nobody has claimed is reported separately
and excluded from everyone's total until it's resolved. Silently splitting it is
how people get overcharged.

**Live sync is polling, deliberately.** Vercel functions can't hold WebSockets
and Neon's pooler has no `LISTEN/NOTIFY`. Clients poll a one-integer version
endpoint every 2s, back off when idle, and stop when the tab is hidden. For four
people at a table it's indistinguishable from push, and it never silently
disconnects. `lib/useLiveBill.ts`.

**Identity is a signed cookie.** No passwords, no email. A device id in an
httpOnly signed cookie decides which participant you are; the signature stops
someone with the (freely shared) bill link from reassigning other people's
items. You can only ever modify your own claims.

**No money moves through Tab.** Payment buttons are deep links built from a
handle and an amount. No payment credentials are stored or transmitted.

## Testing

```bash
pnpm test        # split math, balances, payment links (unit + property-based)
pnpm test:e2e    # two browser contexts on one bill, verifying live sync
pnpm ocr:check   # run real receipt photos through extraction
```

`pnpm ocr:check` is the one that matters for OCR quality. Drop photos in
`fixtures/receipts/`, hand-key the truth into `<name>.expected.json`, and it
reports where extraction disagrees with the paper. Public benchmarks tell you
nothing about the faded thermal receipt from the place round the corner.

## Layout

```
app/            routes — upload, review, claim, summary, groups, API handlers
lib/split/      the money math (compute.ts, balances.ts) — pure, no I/O
lib/ocr/        Claude vision extraction: JSON schema, prompt, call
lib/useLiveBill.ts   polling sync hook
components/     receipt paper, participant chips
tests/          unit + property tests; tests/e2e for Playwright
```
