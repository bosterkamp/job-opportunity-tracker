# Quickstart: Interview Count

## Automated checks (run locally before any push)

```sh
npm run lint && npm run typecheck
npm run test:coverage           # ≥ 80% across packages
npx stryker run --force --mutate "<changed files>"   # zero survivors, static included
npm run test:e2e
```

## Manual checks (`npm run dev`)

### Log interviews (US1)

1. **Add one**: On an opportunity, choose "Add interview" and save. The history shows
   "Interview · {today}".
2. **Earlier, with a note**: Add another dated last week with the note "Hiring manager". It
   sits in date order among the stage changes.
3. **Future date**: A date in the future shows "The date can't be in the future".
4. **Before the date added**: A date before the date added shows "An interview can't be before
   the date added".
5. **Stage unchanged**: The opportunity's stage and its "Last change" are unchanged.

### The badge (US2)

1. **Count**: The card shows "2 interviews" at its top right.
2. **None**: An opportunity with none shows no badge.
3. **Closed**: Close one that has interviews. Its card in the Closed column and in the Archive
   shows the count.
4. **The limit**: With 6 interviews, "Add interview" says "This opportunity already has 6
   interviews, the most it can have".

### Correct and remove (US3)

1. **Edit**: Edit an interview's date and note. The history shows the new values.
2. **Remove**: Remove one, and confirm. It's gone, and the badge goes down. Cancelling keeps it.
3. **Date added**: Moving the date added to after the first interview is refused.

### Through Claude (US4, after deploy)

1. **Log**: "I had a panel interview with Farmers today." The history shows the interview with
   "via Claude", and the badge goes up.
2. **Edit**: "That Farmers interview was yesterday." The date moves.
3. **Remove**: Asking Claude to remove an interview is declined, and Claude points to the web
   app.
