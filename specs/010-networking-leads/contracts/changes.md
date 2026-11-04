# Contract Changes: Networking Leads

These changes are added to the existing contracts in the same pull request:
- `specs/001-job-opportunity-tracker/contracts/api.openapi.yaml`: the lead routes and
  `leadId`;
- `specs/003-mcp-server/contracts/mcp-tools.md`: the tools.

## Web API

Every route needs the owner's sign-in, as today. Errors use the existing `{ code, message,
fields }` shape.

### `GET /leads`

`200`: `{ items: LeadWithOpportunities[] }`, sorted by name, ignoring case.

```json
{
  "items": [
    {
      "id": "01JD…",
      "name": "Dana Ruiz",
      "email": "dana@example.com",
      "phone": "+1 555 0100",
      "createdAt": "2026-10-31T15:00:00.000Z",
      "updatedAt": "2026-10-31T15:00:00.000Z",
      "opportunities": [
        { "id": "01JC…", "company": "Acme", "title": "Staff Engineer",
          "stage": "APPLIED", "status": "OPEN" }
      ]
    }
  ]
}
```

### `POST /leads`

Body: `{ name, email?, phone? }`. `201`: the lead (without `opportunities`).
`400 VALIDATION_ERROR`:
- the name is missing or blank ("Name is required"), or longer than 200 characters;
- the email is invalid;
- the phone is longer than 50 characters;
- any other field is sent.

### `PATCH /leads/:id`

Body: any of `{ name, email, phone }`; `null` or blank clears `email` or `phone`.
- `200`: the updated lead.
- `404 NOT_FOUND`: "Lead not found".
- `400`: the same rules as `POST`, and the name can't be cleared.

### `DELETE /leads/:id`

Header `X-Confirm-Delete: true`, as for deleting an opportunity.
- `204`: the lead is deleted and every linked opportunity is unlinked.
- `400 VALIDATION_ERROR`: the header is missing.
- `404 NOT_FOUND`: "Lead not found".

### Opportunities

- **`POST /opportunities`**: takes an optional `leadId`; blank means none.
- **`PATCH /opportunities/:id`**: takes `leadId`; `null` or blank removes it.
- **Both**: an unknown `leadId` is refused with `400 VALIDATION_ERROR`, "That lead doesn't
  exist", on `leadId`.
- **Responses**: `leadId` when set.

## Claude's tools (MCP)

| Tool | Kind | Input | Output |
|---|---|---|---|
| `list_leads` | read | none | `{ leads: [{ id, name, email, phone, opportunities: [{ id, company, title, stage }] }] }`, with `null` for a missing email or phone |
| `add_lead` | change | `name`, `email?`, `phone?` | the lead |
| `update_lead` | change | `id`, then any of `name`, `email`, `phone` (`null` clears email or phone) | the lead |
| `add_opportunity` | change (changed) | adds `leadId?` | as today |
| `update_opportunity` | change (changed) | adds `leadId` (`null` clears it) | as today |
| `get_opportunity` | read (changed) | as today | adds `lead`: `{ id, name, email, phone }` or `null` |

- **Calls**: every tool calls the web API, so refusals carry the web app's messages.
- **Limits**: the change tools count toward the per-minute change limit.
- **No deleting**: no tool deletes a lead.

## Web app routes

- **`/leads`**: the Networking leads page. It's in the main navigation as "Networking leads",
  shown as "Leads" in the phone's bottom bar.
