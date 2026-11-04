# Validation: Use the Tracker from Claude

**Purpose**: Record that feature 003 works, locally and deployed, before calling it done.
**Started**: 2026-10-20

## First release: connect and read (US1 + US2)

### Automated (local)

- [x] Lint (including the test-tag check) and typecheck pass
- [x] All tests pass (962), coverage above the 80% gate
- [x] Token checks: an access token for the MCP URL, from the connector's client, with
  `jot-mcp/tools`, is accepted. The wrong issuer, audience, client, `token_use`, scope, an
  expired token, another key's signature, and non-JWTs are refused
- [x] Discovery: `401` with `resource_metadata` and `scope`; both metadata documents match the
  contract; `GET`/`DELETE /mcp` answer 405; unknown paths 404; tokens are never logged
- [x] Read tools against DynamoDB Local: lists (open, by stage, archive, follow-ups due by the UTC
  date, paging), find (company or title, any case), and get (identical to the web API), with
  the web API's `NOT_FOUND` message
- [x] Infrastructure: the `claude-connector` client, the `jot-mcp` resource server, branding for
  both clients, the MCP function's environment and permissions, routes without an authorizer,
  throttling, and the table TTL; all three Lambda bundles build
- [x] Mutation testing: 100% on every changed file (one equivalent mutant disabled with its
  reason: comparing today's date against the full timestamp gives the same answer)

### Deployed

- [x] The deploy's smoke test passes, including the MCP `401` and both metadata documents
  (2026-10-20, after PR #25: 8 checks)
- 2026-10-20, first deploy (PR #22) failed: the stage's throttling setting for `POST /mcp` was
  applied before CloudFormation created that route ("Unable to find Route by key POST /mcp").
  The rollback failed the same way, leaving `Jot-Api` in `UPDATE_ROLLBACK_FAILED`. The owner
  approved a one-time `continue-update-rollback` (skipping the stage and the import function),
  which returned the stack to `UPDATE_ROLLBACK_COMPLETE`; the live app kept working throughout.
  Fixed by making the stage depend on the MCP routes, with a test for that ordering

### By hand (needs the owner)

- 2026-10-20, first connection attempt: Claude reported "Authorization with Job Tracker failed".
  The logs showed Claude read the discovery documents but never returned with a token. Sending
  Claude's authorization request to Cognito directly returned `invalid_request`: "custom scopes
  requested for resource-binding must be assigned to the resource being requested". Fixed by
  naming the resource server after the MCP URL (scope `<MCP URL>/tools`), with a new Claude
  client `claude`; the owner reconnects with its ID and secret
- [x] Get the client ID and secret (quickstart.md, step 1); the client is now `claude`
- [x] Add the connector in Claude with them, and sign in (steps 2–3). Worked on 2026-10-20, after
  PRs #24 and #25. **This proves the sign-in
  design (research.md §2, Risk).** If Claude refuses, record the error here
- [x] Ask "How many open opportunities do I have, and what's in Interviewing?" (step 1 of
  "Check by hand"); the answer matches the web app
- [ ] Ask about one opportunity's history; it matches the web app
- [ ] On the phone, the connector works in the Claude app
- [ ] Disconnect, and confirm Claude can't reach the tracker (step 7)

## Second release: add and update (US3 + US4)

- 2026-10-20: asked to "set the follow up date to tomorrow for Farmers", Claude said it couldn't
  use `update_opportunity`, as expected in release 1 (read-only). The `find_opportunities`
  description already names the write tools, which is why Claude tried; release 2 adds them.
- Built locally only: the owner is near the monthly GitHub Actions limit, so nothing is pushed
  until they say so. CI's checks run on this machine instead.

### Automated (local), 2026-10-20

- [x] Lint and typecheck pass; all 993 tests pass, coverage 99.8% of lines
- [x] All 62 end-to-end runs pass, including `e2e/mcp-marks.spec.ts` on desktop and both phones
- [x] Write tools against DynamoDB Local: add (with the duplicate warning and add_anyway),
  update (only the given fields, null clears, records `detailsEditedViaClaudeAt`), move (note,
  backdated date, close and reopen), and read_posting (saves nothing); each refusal matches the
  web API's message for the same input
- [x] The change limit: 20 changes a minute, the 21st refused, the next minute fresh; reads and
  duplicate warnings don't count
- [x] Mutation testing: 100% on every file changed in release 2
- [x] The first Claude client is removed; AWS confirmed nothing imports its export

### Deployed (after the owner says to push)

- [ ] The deploy and its smoke test pass
- [ ] Security review (T030): `/mcp` refuses no token, a web app token, a token from another user
  pool, and an expired token
- [ ] By hand: "Set the follow-up date to tomorrow for Farmers. I'm expecting a call from Joel."
  works, and the web app shows "Details last changed through Claude"
- [ ] By hand: add, duplicate warning, move with a note, and asking to delete (refused)
