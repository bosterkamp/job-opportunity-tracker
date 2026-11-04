# Implementation Plan: Use the Tracker from Claude

**Branch**: `003-mcp-server` | **Date**: 2026-10-20 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/003-mcp-server/spec.md`

## Summary

A remote MCP server lets the owner use the tracker from the Claude apps as a custom connector.
It's a new Lambda behind the existing HTTP API, serving MCP's Streamable HTTP transport at
`/mcp` without sessions.

Sign-in uses the owner's existing Cognito account. A dedicated Cognito app client for Claude
has its ID and secret entered once in Claude's connector settings. The server publishes OAuth
discovery metadata and checks every token itself: issuer, signature, client, audience, and
scope.

The tools call the web API's own router in process, so every rule and message is identical.
Changes carry a "via Claude" mark shown in the web app, and a counter in DynamoDB limits
changes to 20 a minute. Reading a posting link goes through feature 002's import function.
Details and the alternatives are in [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript 6.0 on Node.js 24 (Lambda `nodejs24.x`), as before

**Primary Dependencies**:
- **Existing**: zod 4, AWS SDK v3, AWS CDK v2, React 19
- **New, in the API package only**: `@modelcontextprotocol/sdk` 1.32 (its
  `WebStandardStreamableHTTPServerTransport` and `McpServer`), and `aws-jwt-verify` 5.2 (AWS's
  JWT verification library for Cognito tokens)

**Storage**: The existing DynamoDB table. Opportunities gain `detailsEditedViaClaudeAt`, and
history entries gain an optional `via`. Rate counter items `RATE#mcp#<minute>` expire through a
new table TTL attribute, `expiresAt`

**Testing**:
- **Vitest**: the token checks, with keys generated in the tests; the tools, through the SDK's
  in-memory transport against DynamoDB Local; and the HTTP handling, through Lambda events
- **Playwright**: the "via Claude" marks in the web app
- **Deployed smoke test**: the MCP `401` and the metadata documents
- **By hand**: connecting from the Claude app
- **Gates**: coverage at or above 80%, and no surviving mutants

**Target Platform**: AWS Lambda in `us-east-1`, reached by Claude's servers (from
`160.79.104.0/21`); the Claude apps on web, desktop, and mobile

**Project Type**: Web application (React SPA, serverless API, CDK), plus an MCP endpoint

**Performance Goals**: A typical tool call answers within 5 seconds (SC-006). The discovery
documents answer well within Claude's 10-second limit

**Constraints**:
- Every request is authorized for the owner only (FR-003, FR-004)
- No deleting (FR-014)
- At most 20 changes a minute through Claude (FR-017)
- No new third party beyond the owner's own Claude account, which needs a constitution
  amendment (below)
- Claude Code isn't supported, because Cognito can't register its loopback redirect

**Scale/Scope**: One user. Seven tools. One new Lambda, one new Cognito app client, and four
new routes

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | How the plan complies | Status |
|---|---|---|
| I. Pipeline-centric workflow | Stage moves through Claude use the same single action and rules. | PASS |
| II. History is never lost | Nothing is deleted through Claude (FR-014). Every stage change still writes its history entry, now with a `via` mark. | PASS |
| III. Fast capture, progressive detail | Adding through Claude needs only company and title (the same schema). | PASS |
| IV. Data privacy & ownership | **Conflict**: the feature sends opportunity data to the owner's Claude account (Anthropic), a third party. **Resolution**: amend Principle IV (proposed below) to allow an assistant service the owner connects and authorizes, and only the data needed for each request. Access is the owner's sign-in only, checked on every call, and revocable by disconnecting. | PASS (amendment approved 2026-10-20, constitution 4.1.0, with master's 3.1.0 change) |
| V. Simplicity (YAGNI) | Reuses the API router, the table, Cognito, and the import function. Additions (a Lambda, two dependencies, the metadata, a rate counter) are justified in Complexity Tracking. | PASS (justified) |
| VI. Test the rules | No rule is re-implemented. Tests prove the tools enforce the same rules and messages, and that the token checks refuse every bad token. | PASS |
| VII. Automated quality gates | Same pipeline. A new `mcp` tag. The deployed smoke test covers the MCP `401` and metadata. | PASS |

### Proposed amendment: Principle IV (constitution 3.0.0 → 4.0.0)

> All data MUST be private to its owner by default. It MUST NOT be shared with or sent to third
> parties, with one exception: an assistant service that the owner connects and authorizes
> themselves (for example their own Claude account) MAY receive the data it needs to answer the
> owner's requests. That access MUST require the owner's sign-in on every request, MUST NOT
> allow deleting data, and MUST be revocable by the owner at any time. All data MUST be stored
> in the owner's own account.

This is MAJOR because it redefines a principle. **Approved by the owner on 2026-10-20** and
applied as constitution 4.1.0, with master's 3.1.0 change.

**Post-design re-check (after Phase 1)**: PASS. The contracts add
seven tools that map to existing API operations and two public, read-only metadata documents.
The data model's additions are optional fields that don't change existing behavior.

## Project Structure

### Documentation (this feature)

```text
specs/003-mcp-server/
├── plan.md              # This file
├── research.md          # Phase 0: Claude's connector requirements, Cognito fit, hosting, tracing
├── data-model.md        # Phase 1: via marks, the rate counter, the token checks
├── quickstart.md        # Phase 1: connecting Claude, and the checks to run
├── contracts/
│   ├── mcp-tools.md     # The seven tools: inputs, outputs, errors
│   └── oauth-metadata.md # The 401, Protected Resource Metadata, authorization server metadata
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
packages/shared/src/
├── schemas.ts               # (changed) StageChange.via, Opportunity.detailsEditedViaClaudeAt
└── changeSource.ts          # VIA values ('CLAUDE'), shared by API and web

packages/api/src/
├── repo/opportunityRepo.ts  # (changed) write `via`; set or clear detailsEditedViaClaudeAt
├── handler.ts               # (changed) a `via` dependency, default web
├── mcp/
│   ├── auth.ts              # token checks (aws-jwt-verify), the 401 with resource_metadata
│   ├── metadata.ts          # Protected Resource Metadata and authorization server metadata
│   ├── tools.ts             # the seven tools, calling the API router in process
│   ├── rateLimit.ts         # 20 changes a minute, counted in DynamoDB
│   ├── importClient.ts      # invokes ImportFunction for posting links
│   └── server.ts            # McpServer + WebStandardStreamableHTTPServerTransport
└── mcpHandler.ts            # Lambda entry: API Gateway event ⇄ Request/Response

packages/web/src/pages/OpportunityDetail.tsx   # (changed) "via Claude" marks

packages/infra/lib/
├── auth-stack.ts            # (changed) the Claude app client and the jot-mcp resource server
├── data-stack.ts            # (changed) TTL attribute expiresAt
└── api-stack.ts             # (changed) McpFunction, its routes and throttling, invoke ImportFunction

e2e/
├── mcp-marks.spec.ts        # @mcp: "via Claude" marks in the web app
└── deployed-smoke.spec.ts   # (changed) the MCP 401 and the metadata

.specify/memory/constitution.md   # (changed) Principle IV amendment, 4.0.0
```

**Structure Decision**: The existing monorepo. The MCP server lives in the API package, so the
tools can use the API router and repository directly; it is a separate Lambda entry point.

## Complexity Tracking

| Addition | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| A third Lambda (`McpFunction`) | Its own permissions (table, invoke the import function), throttling, and bundle (the MCP SDK), without growing the web API's | A route in the API Lambda would ship the MCP SDK and the token checks in every web request's cold start, and mix two auth models in one function |
| `@modelcontextprotocol/sdk` | The MCP protocol (versions, JSON-RPC, tool schemas) | Writing the JSON-RPC by hand would drift from the protocol |
| `aws-jwt-verify` | Correct verification of Cognito tokens (key rotation, `token_use`, claims) in a Lambda that has no API Gateway authorizer | API Gateway's JWT authorizer can't return the `resource_metadata` 401 Claude needs |
| Our own authorization server metadata | Cognito's discovery leaves out the PKCE advertisement the MCP spec requires, and serves no RFC 8414 document | Pointing Claude straight at Cognito risks a spec-compliant client refusing to start |
| A DynamoDB rate counter (and table TTL) | A change limit shared across Lambda instances (FR-017) | Route throttling alone allows hundreds of writes a minute; an in-memory counter is per instance |
