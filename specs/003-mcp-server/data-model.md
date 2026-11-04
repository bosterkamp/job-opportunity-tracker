# Data Model: Use the Tracker from Claude

**Feature**: [spec.md](./spec.md) | **Date**: 2026-10-20

Changes to feature 001's model ([data-model.md](../001-job-opportunity-tracker/data-model.md))
are additive and optional, so existing items need no migration.

## Change source (`via`)

| Value | Meaning |
|---|---|
| (absent) | Made in the web app, or before this feature |
| `CLAUDE` | Made through the Claude connector |

The name is `via` because the opportunity already has `source` ("where you found it").

## StageChange (history entry): one new field

| Field | Type | Rules |
|---|---|---|
| `via` | `"CLAUDE"` (optional) | Set on the entry when the stage change, or the opportunity's creation, was made through Claude. Never set for the web app. Never changed afterwards. |

## Opportunity: one new field

| Field | Type | Rules |
|---|---|---|
| `detailsEditedViaClaudeAt` | ISO date-time, optional, nullable | Set to the time of an edit when Claude edits the details (`PATCH`). Cleared (removed) by an edit made in the web app, so it describes the latest edit only. Not changed by stage moves. |

The web app shows:

- **On a history entry with `via = "CLAUDE"`**: "· via Claude" after the entry's date
- **When `detailsEditedViaClaudeAt` is set**: "Details last changed through Claude on <date>"

## Rate counter (not shown to the owner)

| Attribute | Value |
|---|---|
| `PK` | `RATE#mcp` |
| `SK` | `<minute>`, as `YYYY-MM-DDTHH:MM` in UTC |
| `count` | Changes through Claude in that minute |
| `expiresAt` | Epoch seconds one hour later; DynamoDB's TTL deletes the item |

- **Each change**: before writing, raise `count` by 1 with a condition `count < 20` (or the item
  doesn't exist yet). If the condition fails, the change is refused with
  `RATE_LIMITED` (HTTP-like status 429): "Too many changes through Claude in the last minute.
  Try again shortly."
- **What counts as a change**: creating, editing details, or changing stage.
- **Isolation**: the items use a `PK` that no opportunity uses (`OPP#…`), and never appear in
  lists, which query the index.

## Access token checks (MCP server)

A request is served only when its `Authorization: Bearer` token passes every check:

| Check | Required value |
|---|---|
| Signature | Valid against the user pool's published keys (JWKS) |
| `iss` | `https://cognito-idp.us-east-1.amazonaws.com/<user pool id>` |
| `token_use` | `access` |
| `client_id` | The Claude connector app client's ID |
| `aud` | The MCP server URL (`https://<api>/mcp`), bound by the `resource` parameter |
| `scope` | Includes `<MCP URL>/tools` |
| `exp` | In the future |

Anything else gets `401` (missing or malformed: no `error`; a bad token:
`error="invalid_token"`), always with the `resource_metadata` pointer
([contracts/oauth-metadata.md](./contracts/oauth-metadata.md)).
