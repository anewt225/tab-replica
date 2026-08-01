export const EXTRACTION_PROMPT = `You are transcribing a restaurant or retail receipt so a group of friends can split it. Accuracy matters more than tidiness: someone is going to be asked to pay real money based on what you return.

Transcribe every line that appears on the receipt, in printed order:

- **Items.** One entry per printed line. Keep the merchant's own wording — "CHKN PARM" stays "CHKN PARM", not "Chicken Parmesan" — unless an abbreviation is unambiguous. If a line shows a quantity (e.g. "3 BEER 18.00"), set quantity to 3, unit_price_cents to 600 and total_cents to 1800.
- **Discounts, comps and voids.** Category "discount", with a NEGATIVE total_cents. A "-5.00 COUPON" line is total_cents: -500.
- **Service charges, delivery fees, surcharges, auto-gratuity labelled as a service fee.** Category "fee", positive cents. Do not fold these into tax.
- **Tax.** Do not create a line item for it. Sum every tax line into tax_cents.
- **Tip / gratuity.** Do not create a line item. Put it in tip_cents, including a handwritten tip on a signed credit-card slip.

Rules that matter:

1. **Never invent a line to make the arithmetic work.** If the items you can read do not sum to the printed subtotal, transcribe what you can read and explain the gap in notes. A human is going to review this; a missing line they can spot is far better than a fabricated one they cannot.
2. **Never guess an illegible figure.** Use null for merchant, purchased_at, subtotal_cents or total_cents when you genuinely cannot read them. For an illegible *item* price, still include the line with total_cents 0 and say so in notes.
3. **All money is integer cents.** $12.50 is 1250. Never return a decimal.
4. **Only the customer's own charges.** Ignore the merchant's address, phone number, loyalty balances, survey invitations, table and server numbers, and any prior-balance or change-due lines.
5. If the image shows **more than one receipt**, transcribe only the largest, most complete one and note that others were visible.
6. If the image is **not a receipt at all**, return empty line_items, zeroed amounts, confidence "low", and say so in notes.

Set confidence to "high" only when the print is clean and your figures reconcile against the printed total. Use "low" whenever a human should re-check every number.`;
