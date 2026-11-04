# Quickstart: Posting Deadline

How to check the feature works. Commands are from the repository root.

## Automated

```sh
npm run lint && npm run typecheck && npm run build
npm run test:affected                        # the deadline helper, sort, URL defaults, card, fill
npm run test:e2e -- --grep @deadline         # add with a date, the card's text, the default sort
```

Expected: everything passes, and the full suites (`npx vitest run`, `npm run test:e2e`) still
pass apart from tests updated for the overview's new default sort.

## Locally, by eye

```sh
npm run dev
```

1. **Add**: add an opportunity with "Posted until" set to next month. Its page shows the date.
2. **Edit**: change the date to three days from now, then to last week, then clear it. Each
   saves, and the stage history doesn't change.
3. **Cards**: with dates next month, in three days, and last week, the overview's cards read
   "Open until …", "Closes in 3 days" (orange) and "Posting ended …" (muted). A card without
   a date looks as before.
4. **Default sort**: open `/` with no query. "Sort by" reads "Closing soonest", and each column
   is ordered: in 3 days, next month, the undated ones, then last week's. Choose "Recently
   changed": the URL gains `?sort=recent`, and a reload keeps it.
5. **Archive**: `/archive` still opens sorted by "Recently changed"; closed cards show their date
   without orange.
6. **Fill from link**: fill from a posting whose job data states `validThrough` (most Lever,
   Ashby and Workday postings do). "Posted until" is filled and listed in "Filled in".

## Deployed (needs the owner)

1. **Claude**: ask Claude to add a posting with its closing date, then to list opportunities.
   The date comes back.
2. **iPhone**: the overview's tabs open sorted by "Closing soonest", and the card text fits.
