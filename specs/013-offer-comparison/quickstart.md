# Quickstart: Offer Details and Comparison

How to check the feature works, locally and after deploying.

## Prerequisites

- The local stack: `npm run dev` (DynamoDB Local, the API and the web app), as in the
  [README](../../README.md#running-locally).
- For the Claude checks: the deployed app connected to Claude, as in
  [Use from Claude](../../README.md#use-from-claude).

## Automated checks

```sh
npm run test:affected                       # the Vitest tests tagged for what changed
npm run test:e2e -- --grep @offer           # the flows, desktop and iPhone
npm run test:mutation                       # the mutation score stays at least 95%
```

## By hand

1. **Record** (story 1): on an opportunity with a salary range, choose "Add offer". The title,
   location and arrangement start as the opportunity's. Enter a base of "165k", a 10% bonus,
   "20 days" PTO and a respond-by date two days ahead; save. The Offer section shows 165,000
   and the rest; the salary range is unchanged.
2. **History** (story 2): edit the base to 170,000 and add a 10,000 sign-on bonus. The history
   shows "Offer recorded", then today's change with "Base salary: 165,000 → 170,000" and the
   sign-on bonus added. Save without changes; no entry is added.
3. **Pick and compare** (story 3): with three offers, open Offers, tick two, choose "Compare 2".
   Reload the comparison; it shows the same two. On the board, the Offer column's cards have
   checkboxes too; a fourth can't be ticked.
4. **Score** (story 4): score base salary 5 and 4, equity 0 and 3. Each cell shows its number,
   word and color; the overall row shows each offer's average (0s included). The legend explains
   the scale. Switch to dark mode; everything stays readable.
5. **Custom fields** (story 5): on the comparison, add "Commute". It's a row, and on each offer's
   form. Fill it in and score it for both; rename it to "Commute time"; on Offers, remove it after
   confirming; it's gone from both offers and the comparison.
6. **Respond by** (story 6): the offer due in two days shows "Respond by" in the warning color
   on its card and on the Offers page.
7. **Remove** (story 1): remove an offer after confirming; the confirmation says its history
   goes too; the Offer section is empty and the opportunity is otherwise unchanged.
8. **Claude** (story 7): ask Claude to record "Acme offered 170k base, 15% bonus, 25 days PTO,
   respond by the 28th". The web app shows it, and its history says "via Claude". Ask it to
   score Acme's PTO 4; the comparison shows it. Ask how the offers compare; it reads them. Ask it
   to remove the offer; it says that's done in the web app.
9. **Phones**: on an iPhone, steps 1, 3 and 4 work; the comparison scrolls inside its table with
   the detail names in view, and the page itself doesn't scroll sideways.
