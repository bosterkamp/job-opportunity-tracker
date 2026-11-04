# Validation: Import Job Details from a Posting Link (T045)

**Purpose**: Record that feature 002 works, locally and deployed, before calling it done.
**Started**: 2026-10-19

## Automated (local), 2026-10-19

- [x] `npm run lint` (including the test-tag check) and `npm run typecheck` pass
- [x] Vitest: the extractors (Lever, Ashby, Workday, `@graph`, arrays, Greenhouse API), the
  address guard (every private and reserved range), the fetcher's limits (redirects, size,
  time, content types, compression), the route's outcomes, and the form's fill rules
- [x] Playwright `e2e/import-from-link.spec.ts`: 8 tests pass (every scenario on desktop, the
  fill scenario also on both phones); the whole e2e suite passes (56 tests), so feature 001's
  add flow is unchanged
- [x] Accessibility: axe passes on the add form after a fill and after a failed fill, in light
  and dark mode, with 44 px touch targets on phones
- [x] Mutation testing: 100% on every new and changed source file
- [x] Security review (T043), against a local API with no allowance (as in AWS):
  - refused with `URL_NOT_ALLOWED`: `127.0.0.1`, `localhost`, `[::1]`, `10.0.0.1`,
    `169.254.169.254`, `192.168.1.1`, `100.64.0.1`, `[fd00::1]`, `[::ffff:127.0.0.1]`,
    `0.0.0.0`, a public name that resolves to loopback (`127.0.0.1.nip.io`), credentials in
    the URL, and port 22
  - `file:` links are rejected as invalid, and LinkedIn gets `SIGN_IN_REQUIRED` without a fetch
  - logs contain only the host and the outcome
  - the synthesized ImportFunction role has no inline policy, only the managed basic-execution
    policy for its logs (`packages/infra/tests/stacks.test.ts`)

## Automated (deployed)

- [x] After the deploy (2026-10-20, commit `0f74464`), the smoke test passes (6 checks),
  including `POST /imports` without a token → 401. The import Lambda runs with 256 MB and a
  15 s timeout

## By hand, signed in (needs the owner)

2026-10-20: the owner confirmed that "Fill from link" worked on the deployed app. The
per-site rows below stay open until each site is tried.

On https://<distribution>.cloudfront.net, "Add opportunity". For each link, paste it, choose
"Fill from link", and check the result before saving.

| Posting | Company, title, description right (SC-003) | Other fields | Paste to save, seconds (SC-001: under 30) |
|---|---|---|---|
| A Lever posting | [ ] | | |
| An Ashby posting | [ ] | | |
| A Workday posting | [ ] | | |
| A Greenhouse posting | [ ] | | |
| A LinkedIn posting: shows the sign-in message | [ ] | n/a | n/a |

- [ ] A value typed before filling is kept, and the message says so
- [ ] On the phone, the link field and button are easy to use, and the fill works

## Notes

- Workday sometimes publishes the company with a legal-entity prefix (for example
  "2100 Initech USA"); the form shows it as published, for the owner to tidy before saving.
- Record any problem found by hand here, with the date, and open a GitHub issue for it.
