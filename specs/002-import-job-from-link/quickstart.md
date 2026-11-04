# Quickstart: Import Job Details from a Posting Link

How to check the feature works. The design is in [plan.md](./plan.md), the endpoint in
[contracts/imports.openapi.yaml](./contracts/imports.openapi.yaml), and the fill rules in
[data-model.md](./data-model.md).

## Automated checks

| Command | What it proves |
|---|---|
| `npm test` (or `npm run test:affected` on the branch) | The extractors read every fixture shape (Lever, Ashby, Workday, Greenhouse API, a plain careers page), the address guard blocks every private range, the fetcher enforces its limits, and the fill rules keep typed values |
| `npm run test:e2e:affected` | `e2e/import-from-link.spec.ts` (`@import`): fill from a fixture posting, keep a typed company, each failure message, and adding without a link |
| `npm run test:mutation` | No surviving mutants in the new code |
| The deploy's smoke test | `POST /imports` without a token returns 401 |

## Locally

Run `npm run dev` and open http://localhost:5173/opportunities/new.

1. **Layout**: the job posting link is the first field, and "Fill from link" is disabled until
   a link is entered.
2. **Fill**: paste a real public posting from Lever, Ashby, Workday, or Greenhouse (any open job
   on those sites; the local API can reach the internet). Choose "Fill from link". The company,
   title, and description fill in, and a message lists the filled fields. Nothing is saved until
   you choose "Save opportunity".
3. **Keep typed values**: type a company first, then fill. Your company is kept, and the message
   says so.
4. **Failures**: try a LinkedIn job link (the sign-in message), `https://example.com` (no job
   details), and `http://localhost:3001` (the link can't be used). Each time the form is
   unchanged.
5. **Without a link**: add an opportunity with only a company and title. It saves as before.

## Deployed (by hand, signed in)

On the CloudFront URL, repeat steps 2–4 with one real posting from each of Lever, Ashby,
Workday, and Greenhouse. Record the results, and the time from pasting to saving (SC-001: under
30 seconds), in `checklists/validation.md` when it is created during implementation.
