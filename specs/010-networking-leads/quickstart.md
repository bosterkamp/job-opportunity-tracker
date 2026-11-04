# Quickstart: Networking Leads

How to check the feature works, locally and once deployed.

## Locally

1. Start the app as usual (`npm run dev`, with Docker Desktop running for the local table).
2. **The page**: choose "Networking leads" in the navigation. It says there are no leads yet
   and offers "Add lead".
3. **Add**: choose "Add lead", enter a name, an email and a phone, and save. The lead shows
   with its email and phone as plain text. Tapping them does nothing.
   - Saving with no name says "Name is required".
   - An invalid email says "Enter a valid email address".
4. **Link**: add an opportunity and pick the lead under "Lead". The opportunity's page shows
   the lead's name, email and phone. The lead's card lists the opportunity with its stage.
5. **Unlink**: edit the opportunity and choose "No lead". The opportunity's page no longer
   shows a lead, and the lead's card no longer lists it.
6. **Delete**: link the opportunity again, then delete the lead. The dialog says one
   opportunity will be unlinked. After confirming, the lead is gone and the opportunity is
   still there, with no lead.
7. **Phones**: in the browser's iPhone view, the bottom bar reads Overview, Archive, Leads, and
   nothing scrolls sideways.

## Automated

- `npm run lint`, `npm run typecheck`, `npm test`
- `npm run test:e2e`, which includes `e2e/leads.spec.ts` (`@leads`).

## Deployed (the owner)

- **The page**: on the iPhone, open Leads, add a lead, and link an opportunity to it.
- **Claude**:
  - Ask Claude to add a lead and link an opportunity to it. The web app shows both.
  - Ask Claude to list your leads, then to show that opportunity; its lead comes back.
