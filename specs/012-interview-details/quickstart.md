# Quickstart: Interview Details

How to check the feature works, locally and after deploying.

## Prerequisites

- The local stack: `npm run dev` (DynamoDB Local, the API and the web app), as in the
  [README](../../README.md#running-locally).
- For the Claude checks: the deployed app connected to Claude, as in
  [Use from Claude](../../README.md#use-from-claude).

## Automated checks

```sh
npm run test:affected                       # the Vitest tests tagged for what changed
npm run test:e2e -- --grep @interview       # the flows, desktop and iPhone
npm run test:mutation                       # the mutation score stays at least 95%
```

## By hand

1. **Details** (story 1): on an opportunity, choose "Add interview". Pick Hiring manager, Panel,
   Video, Went well, and the next steps "Decision by Friday"; save. The interview's page shows
   each field. Edit it to Engineering; the change shows.
2. **Interviewers** (story 2): on the same interview, add three interviewers, one with only a
   name. Remove one and change another's title. Enter `linkedin.com/in/someone` for one; it
   shows as a link that opens `https://linkedin.com/in/someone`. An email without `@` is
   refused.
3. **Section and page** (story 3): the opportunity's Interviews section lists the interview;
   the history shows one line for it, which opens the same page. Reload the interview's page; it
   still shows. Remove the interview and confirm; you're back on the opportunity, and it's gone
   from the section, the history and the card's count.
4. **Upcoming** (story 4): add an interview for tomorrow at 2:00 PM. It's under "Upcoming", not
   in the history, and "How it went" isn't offered. On the board, its card shows "Next
   interview" with tomorrow's date and time, and the interview count hasn't changed. Edit its
   date to an hour ago: it moves to the past, appears in the history, and the count goes up.
5. **Older interviews**: an interview logged before this feature still shows its date and note,
   and the card's count is unchanged.
6. **Limit**: with 5 past interviews, add one upcoming; a 7th is refused with the limit stated.
7. **Claude** (story 5): ask Claude to add "a panel with Acme's engineering team next Thursday
   at 2 with Priya Shah and Tom Lee". The web app shows it as upcoming with both interviewers.
   Ask Claude what's coming up at Acme; it names the interview. Ask it to record that it went
   well; the web app shows that once the interview is past. Ask it to remove the interview; it
   says that's done in the web app.
8. **Phones**: on an iPhone, steps 1 to 4 work with nothing scrolling sideways.
