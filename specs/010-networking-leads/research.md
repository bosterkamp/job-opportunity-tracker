# Research: Networking Leads

## 1. Storing leads

- **Decision**: Leads go in the existing table, one item each:
  - **Key**: `PK = LEAD#<id>`, `SK = LEAD`.
  - **Listing**: the existing GSI1, with `GSI1PK = LEADS` and `GSI1SK = <id>`. The API sorts by
    name, ignoring case, since a name can change and the list is short.
  - **Attributes**: `id`, `name`, `email?`, `phone?`, `createdAt`, `updatedAt`. Nothing else
    (spec FR-002).
- **Rationale**:
  - The index already projects every attribute, so listing needs no new index and no change to
    the infrastructure.
  - `LEAD#` keys can't clash with `OPP#` ones, and `STATUS#` partitions never hold leads, so
    nothing that lists opportunities changes.
- **Alternatives considered**:
  - A second table: more infrastructure, permissions and local setup, for a handful of items.
  - Sorting by name in the index: renaming a lead would mean rewriting its sort key, for a sort
    the API can do on a short list.

## 2. Linking an opportunity to a lead

- **Decision**: The opportunity gains one optional field, `leadId` (spec FR-006: at most one
  lead).
  - **Add and edit**: create takes `leadId`; PATCH takes `leadId`, and `null` or blank removes
    it, like every clearable field. The repository stores fields as given, so older
    opportunities simply have none (no migration).
  - **Checked**: when a request sets `leadId`, the route reads the lead first and refuses an
    unknown one: `VALIDATION_ERROR`, "That lead doesn't exist", on `leadId`.
  - **No history**: it's a detail edit, so it adds no stage history entry and doesn't touch
    `lastStageChangeAt` (FR-008).
- **Rationale**: one field on the side that has at most one link keeps the opportunity the only
  thing a link changes, with the same validation and clearing as every other detail.
- **Alternatives considered**:
  - Link items (`OPP#id / LEAD#id`): only needed for several leads per opportunity, which the
    owner ruled out.
  - A list of opportunity ids on the lead: two items to keep in step on every link and unlink.
  - A transactional check that the lead still exists: a lead deleted in the same instant as the
    link is saved would leave a link to nothing. With one user that's next to impossible, and
    reading an opportunity ignores a link to a missing lead anyway (§4), so a plain read before
    the write is enough.

## 3. Deleting a lead

- **Decision**: `DELETE /leads/:id` needs `X-Confirm-Delete: true`, like deleting an
  opportunity.
  - **Unlinking**: the route lists open and closed opportunities, finds those linked to the
    lead, and the repository deletes the lead and removes `leadId` from each one in a single
    transaction. Each unlinked opportunity's `updatedAt` is set; nothing else changes.
  - **Large numbers**: if a lead has more than 99 opportunities (beyond DynamoDB's 100 items per
    transaction), the unlinks are written in batches first and the lead is deleted last.
  - **The confirmation**: the web app counts the linked opportunities from the leads list and
    names that count in the dialog (spec US2 scenario 4).
  - **Claude**: no tool deletes a lead (spec FR-009; constitution Principle IV).
- **Rationale**: a lead never leaves dangling links when deleted from the app, and two list
  queries are cheap for one person's data.
- **Alternatives considered**: leaving links to a deleted lead and ignoring them on read. That
  hides the problem, and Claude would still see a `leadId` that points nowhere.

## 4. Reading leads and links

- **Decision**:
  - **`GET /leads`**: every lead, sorted by name. Each comes with its linked opportunities
    (`id`, `company`, `title`, `stage`, `status`), newest stage change first, found from the
    open and closed lists. That's what the Networking leads page shows (US2 scenario 2), and
    it's what the web app uses to count links when deleting a lead.
  - **Opportunity responses**: they add `leadId`. The web app gets the lead's name, email and
    phone from its cached leads list (the form's picker needs that list anyway).
  - **Claude's `get_opportunity`**: it returns `lead: { id, name, email?, phone? }` or `null`.
    The tool reads the lead through the API, so Claude doesn't need a second call.
  - **A link to a missing lead** (only if §2's race ever happened): it's treated as no lead,
    in the web app and in Claude's tools.
- **Rationale**: one request fills the whole leads page, and the opportunity keeps a plain
  reference instead of a copy of the lead that would go stale when the lead is edited.
- **Alternatives considered**: copying the lead's name onto each linked opportunity. It
  would need updating on every rename, and it's never needed: the web app always has the list.

## 5. The web app

- **Decision**:
  - **The page**: `/leads`, "Networking leads". The main navigation gains it after Archive. On
    phones, where the bottom bar has three items, it reads "Leads", using the same long and
    short labels the site title uses (feature 008).
  - **Each lead**: a card with the name, then the email and phone as plain text, never links
    (the owner's correction, spec FR-003). Under them it lists the linked opportunities, each
    linking to its page and showing its stage. It has "Edit" and "Delete" buttons.
  - **Add and edit**: "Add lead" at the top of the page, styled like "Add opportunity", opens a
    dialog with the three fields. "Edit" opens the same dialog, filled in. Both use the
    existing dialog styles and focus trap. Three fields don't need a page of their own.
  - **Delete**: a confirm dialog like the opportunity's, naming the lead and how many
    opportunities will be unlinked.
  - **The opportunity form**: a "Lead" select with "No lead" and every lead. Leads with the same
    name show their email or phone to tell them apart.
  - **The opportunity's page**: a "Lead" fact with the name, email and phone, when linked.
  - **Data**: new hooks, `useLeads`, `useCreateLead`, `useUpdateLead` and `useDeleteLead`.
    - Saving or deleting a lead refreshes the leads list.
    - Deleting a lead also refreshes the opportunities, since their links change.
    - Saving an opportunity refreshes the leads list, since its linked opportunities change.
- **Rationale**: it follows the existing page, dialog and form patterns, so accessibility, the
  phone layout and the retro theme carry over.
- **Alternatives considered**: pages for adding and editing a lead (`/leads/new`). It's an
  extra route and a page change for three fields.

## 6. Claude's tools

- **Decision**:
  - **`list_leads`** (read): every lead with its id, name, email, phone, and the ids and titles
    of its linked opportunities.
  - **`add_lead`**: name, plus optional email and phone.
  - **`update_lead`**: id plus the fields to change; `null` clears email or phone.
  - **Linking**: `add_opportunity` and `update_opportunity` take `leadId`, and `null` clears it
    on update. `get_opportunity` returns `lead` (§4).
  - **Calls and limits**: the tools call the web API's routes, as every tool does now, so the
    messages are the web app's own. The writes count toward the per-minute change limit.
  - **No deleting**: there's no tool to delete a lead.
- **Rationale**: the same pattern as the opportunity tools, and the owner asked for list, add,
  edit and link.
- **Alternatives considered**: a `find_leads` tool. Not needed: the list is short, and Claude
  can read all of it.

## 7. Tests and tags

- **Decision**: a new test tag, `leads`, mapped to every file the feature touches (as
  `deadline` was for feature 009).
- **What the tests cover**:
  - **Shared schemas**: name required (up to 200 characters), email and phone checked like the
    contact's, no other fields, `leadId` on create and patch.
  - **API integration**: add, list (sorted, with linked opportunities), edit, the confirmed
    delete that unlinks, and an unknown `leadId` refused.
  - **MCP**: the three tools, linking through `add_opportunity` and `update_opportunity`,
    `get_opportunity`'s lead, and no delete tool.
  - **Web units**: the page, both dialogs, the form's select and the detail page.
  - **Playwright** (`@leads @responsive`): add, link, see the link on both sides, delete, and
    axe in light and dark, on desktop and iPhone.
- **Rationale**: Principle VI and VII, as for every feature.
