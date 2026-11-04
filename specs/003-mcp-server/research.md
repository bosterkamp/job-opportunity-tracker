# Research: Use the Tracker from Claude

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-10-20

## 1. What Claude needs from a remote MCP server

From Anthropic's [Authentication for connectors](https://claude.com/docs/connectors/building/authentication)
page (read 2026-10-20), and the MCP authorization specification
([2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)):

- **One client for every Claude app**: claude.ai on the web, Desktop, mobile, and Cowork share
  the same OAuth client and callback URL, `https://claude.ai/api/mcp/auth_callback` (Anthropic
  says it may move to `https://claude.com/api/mcp/auth_callback`, so both are registered).
- **How Claude identifies itself to the authorization server**: through Dynamic Client
  Registration, through a Client ID Metadata Document, or, for a custom connector, with a client
  ID (and optional secret) the user enters under **Advanced settings** when adding it.
- **PKCE**: Claude always sends an S256 code challenge. The spec says the authorization server
  must advertise `code_challenge_methods_supported: ["S256"]` so clients can check before
  starting.
- **Discovery**: an unauthenticated request must get `401` with
  `WWW-Authenticate: Bearer resource_metadata="<url>"`. That Protected Resource Metadata
  ([RFC 9728](https://www.rfc-editor.org/rfc/rfc9728)) names the authorization server, and its
  `resource` must equal the MCP server URL exactly. Claude uses only the first authorization
  server listed, and reads its RFC 8414 metadata or OpenID discovery document.
- **Resource indicator**: Claude sends `resource=<MCP server URL>` on the authorization and token
  requests ([RFC 8707](https://www.rfc-editor.org/rfc/rfc8707)).
- **Scopes**: taken from the `scope` in the `401`'s `WWW-Authenticate`, or else from the
  metadata's `scopes_supported`.
- **Refresh**: Claude refreshes on a `401` and up to five minutes before expiry; a dead refresh
  token must answer `invalid_grant`.
- **Limits**: discovery and token endpoints must answer within 10 seconds. Requests come from
  `160.79.104.0/21`.
- **Transport**: Streamable HTTP. A server may answer each POST with plain JSON and keep no
  sessions.

## 2. How Cognito fits

Checked against the live user pool (`us-east-1_<pool id>`) on 2026-10-20:

| Need | Cognito | Consequence |
|---|---|---|
| Client registration (DCR or CIMD) | Neither | Use a pre-registered Cognito app client for Claude; the owner enters its ID and secret in Claude's Advanced settings, once |
| Authorization code + PKCE S256 | Supported | — |
| Advertise `code_challenge_methods_supported` | **Not in the discovery document** | A spec-compliant client may refuse to continue. Serve our own authorization server metadata (§3) |
| RFC 8414 metadata | Not served (`/.well-known/oauth-authorization-server` answers 400) | Same |
| `resource` parameter (RFC 8707) | Supported on the managed-login authorize endpoint: any `https` URL, bound into the access token's `aud` | The MCP server checks `aud` equals its own URL, so a token for the web app can't be used against it |
| Exact redirect URIs only | Yes | Claude Code's ephemeral loopback ports can't be registered. Claude Code is out of scope (see spec Assumptions); the hosted Claude apps are what the owner asked for |

### Decision: a Claude app client, plus our own authorization server metadata

- **Decision**:
  - **The app client**: a new Cognito app client, "Claude connector", that is confidential (it
    has a secret). It uses the authorization code grant with PKCE and allows only the custom
    scope `jot-mcp/tools`. Its callbacks are the two Claude URLs. Access tokens last one hour,
    and refresh tokens 30 days.
  - **The metadata**: the MCP server publishes its Protected Resource Metadata, plus an RFC 8414
    authorization server document on the same API. That document points to Cognito's own
    authorize, token, and revoke endpoints, and adds the fields Cognito leaves out:
    `code_challenge_methods_supported`, `grant_types_supported`, and `scopes_supported`.
  - **No `openid` scope**: requesting it would give Claude an ID token whose issuer (Cognito)
    differs from the metadata's issuer. The custom scope avoids the mismatch.
- **Rationale**: This keeps the owner's existing account and sign-in page (spec FR-002, FR-004)
  and adds no new identity service. Cognito still issues, signs, and expires every token. The
  metadata only describes Cognito's endpoints accurately.
- **Risk**: Whether Claude accepts metadata whose issuer isn't the token issuer can only be
  proven by connecting for real. The tasks include that check early, before the tools are built.
- **Found on the first real connection (2026-10-20)**: Cognito accepts `resource` only when every
  requested custom scope belongs to a resource server whose **identifier is that resource**
  ("custom scopes requested for resource-binding must be assigned to the resource being
  requested"). The resource server's identifier is therefore the MCP URL, its scope
  `<MCP URL>/tools`, and the resource server and Claude client live in the API stack, where that
  URL is known.
- **Fallbacks considered**:
  - **A small registration endpoint**: one that returns the pre-created client (a DCR shim), if
    Claude ignores the client ID entered in the dialog.
  - **A full authorization server in front of Cognito** (a proxy): more code and more risk.
    Kept only as a last resort.
  - **Another identity provider** (Auth0, WorkOS): rejected, because it adds a third party that
    would hold the owner's sign-in (Principle IV).

## 3. Hosting the MCP server

- **Decision**: a third Lambda, `McpFunction`, behind the existing HTTP API:
  - **Routes**: `POST`, `GET`, and `DELETE /mcp`, plus
    `GET /.well-known/oauth-protected-resource/mcp` and
    `GET /.well-known/oauth-authorization-server`
  - **No API Gateway authorizer on these routes**: the Lambda checks the token itself, because
    the API Gateway JWT authorizer answers `401` without the `resource_metadata` pointer Claude
    needs to find the sign-in. The metadata routes are public by design
  - **Token checks** with AWS's `aws-jwt-verify` library: the signature against Cognito's
    published keys, the issuer, the expiry, `token_use = access`, `client_id` = the Claude app
    client, `aud` = the MCP URL, and the `jot-mcp/tools` scope
  - **Transport**: the MCP TypeScript SDK's `WebStandardStreamableHTTPServerTransport`, which
    takes a standard `Request` and returns a `Response`. It keeps no sessions and answers with
    JSON (`enableJsonResponse`). `GET` and `DELETE` answer 405, because there's no server
    stream to resume
- **Rationale**: Same API, same deploy, same CORS-free server-to-server calls (Claude's servers
  call the MCP server, not a browser). A separate function keeps the MCP SDK and the token
  checks out of the web API's bundle, and lets it have its own permissions and throttling.
- **Alternatives**:
  - **A Lambda function URL**: a second public endpoint with its own auth handling; no
    benefit over a route.
  - **Bedrock AgentCore Gateway**: a managed MCP gateway, but more services than one owner
    needs (Principle V).
  - **Writing the JSON-RPC handling by hand**: rejected; the SDK tracks protocol versions.

## 4. Keeping every rule identical (spec FR-011)

- **Decision**: the MCP tools call the existing API router **in process**, through the same
  `createHandler` the web API uses, with one new dependency: `via: 'CLAUDE'`. Validation, stage
  rules, optimistic locking, and error messages are therefore literally the web API's code.
- **Duplicate warning**: the web app checks duplicates in the browser, so the `add_opportunity`
  tool checks the open list with the shared `findPossibleDuplicate` first. It adds only when
  called with `add_anyway: true`.
- **Reading a posting link**: the MCP function **invokes `ImportFunction`** (permission to invoke
  that one function only) instead of fetching pages itself. The function that reaches the
  internet still has no table access, and the function with table access never fetches
  untrusted pages (feature 002's boundary).
- **Alternative**: re-implementing the rules in the tools (duplication, drift).

## 5. Tracing what Claude changed (spec FR-015, FR-016)

- **Decision**:
  - **Stage changes**: each history entry gets an optional `via`. It's `"CLAUDE"` when made
    through Claude and left out otherwise, so existing entries need no migration. The entry
    created with an opportunity carries it too.
  - **Detail edits**: an opportunity gets `detailsEditedViaClaudeAt`. It's set when Claude edits
    the details, and cleared by an edit in the web app, so it always describes the latest edit.
  - **The web app shows**: "via Claude" on those history entries, and "Details last changed
    through Claude on <date>" when that field is set.
- **Name**: `via`, because the opportunity already has `source` ("where you found it").

## 6. Limiting changes (spec FR-017)

- **Decision**:
  - **Throttling**: API Gateway route throttling on `/mcp`, 5 requests a second with a burst
    of 10.
  - **A change limit**: at most **20 changes a minute** through Claude, counted in DynamoDB.
    Each minute gets a counter item, `RATE#mcp#<minute>`, raised with a conditional update and
    expired after an hour by a TTL. Once a minute's limit is reached, further changes that
    minute are refused with "Too many changes through Claude in the last minute. Try again
    shortly." Reads aren't limited beyond the throttling.
- **Rationale**: Throttling alone still allows hundreds of writes a minute. A counter in the
  table is shared by every Lambda instance, which an in-memory counter isn't.

## 7. Testing

- **Token checks**: unit tests with keys generated in the test and an injected key set, covering
  a wrong issuer, audience, client, `token_use`, missing scope, expiry, and signature.
- **Tools**: integration tests against DynamoDB Local, using the SDK's in-memory client and
  server transports. One test per tool, plus the rule refusals. Each refusal is checked against
  the same message the web API gives (SC-005).
- **HTTP layer**: through the Lambda handler with API Gateway events. Covers the `401` and its
  header, the metadata documents, a JSON-RPC `initialize`, `tools/list`, and a `tools/call`.
- **Web app**: unit tests and Playwright for the "via Claude" marks.
- **Deployed smoke test**: `POST /mcp` without a token answers `401` with the
  `resource_metadata` header, and both metadata documents are served.
- **By hand**: add the connector in the Claude app and run the quickstart. This is also the
  early check of the §2 risk.
- **Test tag**: `mcp`.
