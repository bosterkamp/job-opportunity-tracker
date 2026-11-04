# Quickstart: Use the Tracker from Claude

How to connect Claude and check that the feature works. Design: [plan.md](./plan.md); tools:
[contracts/mcp-tools.md](./contracts/mcp-tools.md); sign-in: [contracts/oauth-metadata.md](./contracts/oauth-metadata.md).

## Automated checks

| Command | What it proves |
|---|---|
| `npm run test:affected` (on the branch) | The token checks refuse every bad token; each tool works against DynamoDB Local and enforces the web API's rules and messages; the change limit; the `401` and metadata documents |
| `npm run test:e2e:affected` | The web app shows "via Claude" marks |
| The deploy's smoke test | `POST /mcp` without a token answers `401` with the `resource_metadata` header; both metadata documents are served |

## Connect Claude (once, after deploy)

1. Get the connector's client ID and secret (the secret is never in a stack output):

   ```sh
   aws cognito-idp list-user-pool-clients --user-pool-id <pool id> \
     --query "UserPoolClients[?ClientName=='claude'].ClientId" --output text
   aws cognito-idp describe-user-pool-client --user-pool-id <pool id> --client-id <client id> \
     --query UserPoolClient.ClientSecret --output text
   ```

2. In Claude (web or desktop): **Settings → Connectors → Add custom connector**. Name it "Job
   tracker", and enter the URL `<api>/mcp`. Open **Advanced settings**, and enter the client ID and
   secret.
3. Choose **Connect**. The tracker's sign-in page opens; sign in with your tracker account.
4. The connector then works in the Claude mobile app too.

## Check by hand

In a new conversation, with the connector enabled:

1. "How many open opportunities do I have, and what's in Interviewing?" The answer matches the
   web app.
2. "Add Acme, Senior Engineer, 4 stars." It appears in the web app, in Considering. Its history
   says "via Claude".
3. "Add it again." Claude warns about the existing one and asks before adding.
4. "Move Acme to Applied with the note 'sent CV', dated yesterday." The web app shows the
   entry with that note and date, "via Claude".
5. "Change Acme's location to Remote." The web app says "Details last changed through Claude".
6. "Delete Acme." Claude says it can't, and to use the web app.
7. Disconnect the connector, and ask again. Claude can't reach the tracker.
