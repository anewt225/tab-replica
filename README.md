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

## Configuration

### Your Anthropic API key, locally

The key is what lets the app read receipts. It goes in `.env`, which is listed
in `.gitignore` and therefore cannot be committed:

```bash
cp .env.example .env      # if you haven't already
```

Then edit `.env` and fill in the line:

```
ANTHROPIC_API_KEY=sk-ant-...
```

That's the whole setup — nothing else to wire up. Next.js reads `.env`
automatically for `dev`, `build` and `start`, and the standalone scripts opt in
via `tsx --env-file-if-exists=.env`, so `pnpm ocr:check` picks the key up with
no extra flags.

Confirm it never gets committed:

```bash
git status --porcelain .env    # should print nothing
```

**Handling the key**

- **Don't paste it into a chat, an issue, or a PR description.** Treat anything
  pasted into a conversation as disclosed, and rotate it.
- **Create a key dedicated to this project** in the [Anthropic
  Console](https://console.anthropic.com/settings/keys) rather than reusing an
  existing one, so it can be revoked on its own. Set a spend limit while you're
  there — OCR runs roughly $0.01–0.03 per receipt.
- **If it leaks, revoke first, then reissue.** Rotating a key is cheap; working
  out whether an exposure mattered is not.

CI needs no key. The end-to-end job seeds bills through `/api/test/seed`
precisely so it never spends an API call, so there's no secret to add to the
GitHub repository.

### Deploying to Vercel

Built for Vercel plus any Postgres (Neon, Vercel Postgres, Supabase). In order:

1. **Create a Postgres database** and copy its connection string.
2. **Import the GitHub repo** into Vercel.
3. **Add the environment variables below _before_ the first deploy** — under
   **Project → Settings → Environment Variables**, or in the Environment
   Variables section Vercel shows during import. Tick Production, Preview and
   Development unless you want different values per environment.
4. **Deploy.** The `vercel-build` script runs migrations and then builds, so the
   database has its tables before the app serves a request. A bad or missing
   `DATABASE_URL` fails the build rather than shipping a site that errors on
   every page.
5. **Open the URL and upload a receipt** to confirm OCR works end to end.

Two things that catch people out:

- **Environment variables are read at build and start time.** Changing one on an
  existing project does nothing until you redeploy (Deployments → ⋯ → Redeploy).
- **Never prefix a secret with `NEXT_PUBLIC_`.** That prefix bakes the value
  into the JavaScript sent to browsers. There are none in this project, and the
  API key is only ever used from server-side code, so it never reaches a
  visitor's device — one key on the server serves everyone who opens the link.

Vercel stores these encrypted, so the key never touches the repository:

| Variable | Required | What it's for |
|---|---|---|
| `DATABASE_URL` | Yes | Postgres connection string |
| `DEVICE_COOKIE_SECRET` | Yes | Signs the device cookie. Generate with `openssl rand -hex 32` — the app refuses to start in production without it |
| `ANTHROPIC_API_KEY` | For OCR | Receipt transcription. Without it everything works except reading receipts |
| `BLOB_READ_WRITE_TOKEN` | Recommended | Receipt image storage. Without it images are written to `./uploads`, which does not survive on serverless |

Use a **separate key for production** from the one on your laptop, so a leak in
one place doesn't force you to rotate both.

Migrations run automatically on deploy — there's no manual database step. If
preview deployments ever get their own database, gate the migrate half of
`vercel-build` on `VERCEL_ENV=production` so previews can't touch production.

> **A public URL has no login, by design.** Anyone who has the link can upload a
> receipt, and each one costs roughly $0.01–0.03 of your API budget. That's fine
> for a link texted to a few people. Set a **spend limit** on the key so the
> worst case is a number you chose, and add rate limiting before sharing it
> anywhere public.

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
pnpm typecheck   # TypeScript
pnpm lint        # ESLint (advisory in CI — reports, doesn't block)
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
