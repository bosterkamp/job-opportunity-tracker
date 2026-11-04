# Contract: OAuth discovery for the MCP server

**Feature**: [spec.md](../spec.md) | **Background**: [research.md](../research.md) §1–2

`<api>` is the HTTP API's URL, for example `https://<api id>.execute-api.us-east-1.amazonaws.com`.
`<cognito>` is the managed-login domain, `https://jot-<account>.auth.us-east-1.amazoncognito.com`.

## The 401

Any `/mcp` request without a valid token:

```http
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer resource_metadata="<api>/.well-known/oauth-protected-resource/mcp", scope="<api>/mcp/tools"
Content-Type: application/json

{"error": "unauthorized"}
```

A token that was present but failed a check adds `error="invalid_token"` to the header.

## Protected Resource Metadata (RFC 9728)

`GET <api>/.well-known/oauth-protected-resource/mcp`, public, `Cache-Control: max-age=300`:

```json
{
  "resource": "<api>/mcp",
  "authorization_servers": ["<api>"],
  "scopes_supported": ["<api>/mcp/tools"],
  "bearer_methods_supported": ["header"],
  "resource_name": "Job Opportunity Tracker"
}
```

## Authorization server metadata (RFC 8414)

`GET <api>/.well-known/oauth-authorization-server`, public, `Cache-Control: max-age=300`. It
describes Cognito's endpoints, adding what Cognito's own discovery document leaves out:

```json
{
  "issuer": "<api>",
  "authorization_endpoint": "<cognito>/oauth2/authorize",
  "token_endpoint": "<cognito>/oauth2/token",
  "revocation_endpoint": "<cognito>/oauth2/revoke",
  "response_types_supported": ["code"],
  "grant_types_supported": ["authorization_code", "refresh_token"],
  "code_challenge_methods_supported": ["S256"],
  "token_endpoint_auth_methods_supported": ["client_secret_basic", "client_secret_post"],
  "scopes_supported": ["<api>/mcp/tools"]
}
```

No `registration_endpoint` is advertised, and neither is `client_id_metadata_document_supported`:
Claude uses the client ID and secret the owner enters in the connector's Advanced settings.

## The Cognito app client for Claude

| Setting | Value |
|---|---|
| Name | `claude` (in the API stack, where the MCP URL is known) |
| Secret | Generated (confidential client) |
| OAuth flows | Authorization code grant only |
| Scopes | `<api>/mcp/tools`: the resource server's identifier **must be the MCP URL**, because Cognito binds a token to the requested `resource` only for scopes of the resource server with that identifier |
| Callback URLs | `https://claude.ai/api/mcp/auth_callback`, `https://claude.com/api/mcp/auth_callback` |
| Token validity | Access 1 hour; refresh 30 days |
| Identity providers | The user pool (managed login), same as the web app |
