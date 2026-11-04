# Quickstart: Notes on Networking Leads

How to check the feature works, locally and once deployed. What each route and tool takes is
in [contracts/changes.md](./contracts/changes.md).

## Locally

1. Start DynamoDB Local and the app as for every feature (README, "Run locally").
2. `npm run test:affected` runs the tests tagged `leads`; `npm run test:e2e -- --grep @leads`
   runs the end-to-end ones on desktop and iPhone.
3. In the app, open **Networking leads**, add a lead, then:
   - **Add note** with today's date: it shows on the card with today's day.
   - Add one dated last week: today's stays on top, and "Show all 2 notes" lists both.
   - Edit the older one's text; delete it after confirming.
   - Try an empty note: "Write a note", nothing saved.
   - Delete the lead: the confirmation says how many notes will be deleted.
4. The navigation reads Overview, Networking leads, Archive, on desktop and on a phone-sized
   window.

## Deployed (the owner)

- **iPhone**: on a lead, add a note, open all its notes, and edit one.
- **Claude**: ask Claude to add a note to a lead for yesterday; the web app shows it under
  yesterday. Ask what notes the lead has; Claude lists them. Ask it to fix a note's wording;
  the web app shows the change. (The connector may need reconnecting to see the new tools.)
