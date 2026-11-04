# Research: Import Job Details from a Posting Link

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-10-19

## 1. What the common hiring sites publish

Sampled on 2026-10-19 by fetching one live posting from each site the way the server will (a
plain HTTPS GET without JavaScript):

| Site | Standard job data in the HTML | Notes |
|---|---|---|
| Lever (`jobs.lever.co`) | Yes: schema.org `JobPosting` in a JSON-LD script | title, `hiringOrganization.name`, `jobLocation.address`, `employmentType`, HTML `description` |
| Ashby (`jobs.ashbyhq.com`) | Yes: `JobPosting` | Adds `baseSalary` (min, max, currency, `unitText: YEAR`) and `jobLocationType: TELECOMMUTE` |
| Workday (`*.myworkdayjobs.com`) | Yes: `JobPosting` | The company can carry a legal-entity prefix ("2100 NVIDIA USA"); `addressLocality` holds the whole location |
| Greenhouse (`job-boards.greenhouse.io`, `boards.greenhouse.io`) | **No**. The page is a Remix app; only `og:title` and a location in `og:description` | Greenhouse's documented public Job Board API (`boards-api.greenhouse.io/v1/boards/{board}/jobs/{id}?pay_transparency=true`) returns `title`, `company_name`, `location.name`, `content` (HTML, escaped twice), `pay_input_ranges`, and a "Location Type" metadata value |
| LinkedIn | No: a sign-in wall (HTTP 999 or a redirect to `/authwall` or `/login`) | Out of reach by design (spec Assumptions) |

### Decision: schema.org `JobPosting` first, plus a Greenhouse adapter

- **Decision**: Read the posting's JSON-LD `JobPosting`, which covers Lever, Ashby, Workday, and
  most company careers pages that are built for search engines. For Greenhouse links, call
  Greenhouse's public Job Board API for the same posting instead of reading the page.
- **Rationale**: `JobPosting` is the format Google for Jobs requires, so it's the most widely
  published. Greenhouse is the most common hiring site and publishes nothing usable in its
  page, but its public API is documented, needs no key, and returns better data than the page
  would. Both are the site's own public data, so nothing goes to a third party (spec FR-011).
- **Alternatives considered**:
  - **Open Graph and meta tags only**: give a title and sometimes a location, never a description
    or company. Not enough to be worth a fill, and guessing the company from `og:site_name` is
    often wrong. Not used for job details.
  - **A headless browser** to run each page's JavaScript: a far heavier Lambda (a Chromium layer,
    1–2 GB memory, slow cold starts) for sites that mostly publish JSON-LD already. Rejected
    (Principle V).
  - **AI extraction**: declined by the owner (spec Clarifications).
  - **Adapters for more sites' private APIs** (Workday's CXS, Lever's postings API): not needed,
    because their pages carry `JobPosting`.
- **Out of scope**: Greenhouse boards embedded on a company's own site (`?gh_jid=` links), whose
  board name isn't in the URL. These pages get "no job details were found" unless the company's
  page carries its own `JobPosting`.

## 2. Mapping posting data to the form

| Form field | From `JobPosting` | From the Greenhouse API |
|---|---|---|
| Company | `hiringOrganization.name` (or the string itself) | `company_name` |
| Job title | `title` | `title` |
| Job description | `description` (HTML → text, see §3) | `content` (unescape once, then HTML → text) |
| Location | `jobLocation[].address`: `addressLocality`, `addressRegion`, `addressCountry`, joined with ", ", distinct places joined with "; " | `location.name` |
| Work arrangement | `REMOTE` when `jobLocationType` is `TELECOMMUTE`; otherwise `HYBRID` or `ONSITE` only when the location text says "hybrid" or "on-site/onsite/in office" | The "Location Type" metadata value (Remote, Hybrid, On-Site); else the same text rule |
| Compensation | `baseSalary` (see below) | `pay_input_ranges[0]` (`min_cents`, `max_cents`, `currency_type`, yearly when the title says "Annual") |
| Where you found it | Site name from the host (see below) | "Greenhouse" |

- **JSON-LD shapes**: a script may hold one object, an array, or an `@graph`; `@type` may be a
  string or an array. Every script on the page is read; exactly one `JobPosting` fills the form,
  and more than one gives the "several jobs" message (spec Edge Cases). Malformed JSON in one
  script is skipped, not fatal.
- **Pay** is formatted with `Intl.NumberFormat` in the posting's currency, without decimals:
  "$150,000–$180,000 a year", "€110,000–€185,000 a year", "$45 an hour". `unitText` maps
  `YEAR`/`MONTH`/`WEEK`/`DAY`/`HOUR` to "a year", "a month", "a week", "a day", "an hour"; a
  missing unit leaves the unit off. A single `value` gives one amount; no amount, no pay.
- **Where you found it**: a fixed list of known hosts (`greenhouse.io` → "Greenhouse",
  `lever.co` → "Lever", `ashbyhq.com` → "Ashby", `myworkdayjobs.com` → "Workday",
  `smartrecruiters.com` → "SmartRecruiters", `indeed.com` → "Indeed", `linkedin.com` →
  "LinkedIn"), else the host without `www.` ("acme.com"). The page's own `og:site_name` is not
  used, because on hiring sites it's often the company's name.
- **Text cleanup**: every string is trimmed, has HTML entities decoded, and has runs of spaces
  collapsed. Empty strings count as missing.

## 3. Turning the description HTML into plain text

- **Decision**: Parse the description with `htmlparser2` and write plain text: block elements
  (`p`, `div`, `h1`–`h6`, `ul`, `ol`, `br`, `tr`) end a line, paragraphs are separated by a blank
  line, list items start with "• ", `script` and `style` content is dropped, and entities are
  decoded. Cut to 20,000 characters at a word boundary, and report `truncated: true`
  (spec FR-008).
- **Rationale**: Descriptions are untrusted HTML from another site. A real parser handles
  malformed markup and entities correctly where regular expressions don't, and the output is
  plain text that React renders as text, so no markup can reach the page. `htmlparser2` is small,
  fast, has no native code, and is widely used (it also finds the JSON-LD scripts in §1).
- **Alternatives considered**: regular expressions (fragile with nested or broken markup);
  `jsdom` or `cheerio` (much larger than needed in a Lambda bundle); `node-html-parser` (similar
  size, less used).

## 4. Fetching untrusted links safely (spec FR-009, FR-010)

The server will fetch any link the owner pastes, so it must not become a way to reach things
that aren't public web pages (server-side request forgery). In Lambda the main internal target
is the runtime API on `127.0.0.1:9001`.

- **Decision**: a small fetcher on Node's built-in `https`/`http` modules:
  - only `http:` and `https:`, default ports or 80, 443, 8080, or 8443; no user name or password in
    the URL
  - the host name is resolved with a custom `lookup` that rejects every non-public address:
    loopback, private (10/8, 172.16/12, 192.168/16), link-local (169.254/16, including the
    metadata address), carrier-grade NAT (100.64/10), `0.0.0.0/8`, multicast, reserved, and the
    IPv6 equivalents (`::1`, `fc00::/7`, `fe80::/10`, IPv4-mapped addresses). The check runs on
    the address the connection actually uses, so DNS rebinding can't slip past it. IP-literal
    hosts go through the same check
  - redirects are followed by hand, at most 5, and every hop is checked again
  - 10 seconds for the whole fetch, including redirects; 2 MB at most after decompression
    (gzip, deflate, and br through `zlib`); only `text/html` or `application/xhtml+xml`
    (JSON for the Greenhouse API)
  - an honest `User-Agent` naming the tracker, with `Accept-Language: en`
- **Rationale**: Node's built-in `fetch` doesn't expose a DNS hook without importing `undici`
  directly. The built-in modules do, with no new dependency, and every limit can be unit
  tested against a local test server.
- **Alternatives considered**: an allow-list of hiring sites only (safe, but blocks every company
  careers page, which the spec wants to support); running the fetch in a VPC with no route to
  anything internal (the runtime API is still on loopback, and a VPC adds NAT cost).

### Classifying failures (spec FR-014)

| Outcome | When | Message the owner sees |
|---|---|---|
| `SIGN_IN_REQUIRED` | The host is LinkedIn; or HTTP 401, 403, 407, 429, or 999; or a redirect to a path with `login`, `signin`, or `authwall`; or a page that's a bot challenge | "This site doesn't let its postings be read without signing in. Fill in the details by hand." |
| `NO_JOB_DETAILS` | No `JobPosting`, or one without a title | "No job details were found on that page. Fill in the details by hand." |
| `MULTIPLE_JOBS` | More than one `JobPosting` | "That page lists several jobs. Use the link to a single posting." |
| `UNREACHABLE` | DNS failure, connection error, timeout, HTTP 404 or 5xx, too large, or not HTML | "That page couldn't be loaded. Check the link and try again." |
| `URL_NOT_ALLOWED` | A blocked scheme, port, credentials, or a non-public address | "That link can't be used. Use the public link to the job posting." |

## 5. Where the fetch runs

- **Decision**: a second Lambda, `ImportFunction`, behind a new explicit route
  `POST /imports` on the existing HTTP API and the same JWT authorizer. It has **no** DynamoDB
  permissions, 256 MB of memory, and a 15-second timeout. It shares code with the API package
  but has its own small handler.
- **Rationale**: This function makes requests to arbitrary sites and parses untrusted input. If
  it were ever tricked, it should have nothing to reach: no table, no secrets. A separate
  function is the least-privilege boundary, and it also keeps the main API's bundle and
  cold start free of the parser. An explicit route takes precedence over `/{proxy+}`, so the
  main Lambda never sees import requests.
- **Alternative considered**: a route in the existing API Lambda (one fewer function, but it
  would hold read and write access to every opportunity while fetching untrusted pages).

## 6. Local development and tests

- **Locally**, the import route runs in the existing local API server, sharing its router, so
  `npm run dev` works without AWS.
- **Unit tests** cover the extractors (`JobPosting`, Greenhouse, HTML to text, pay, location, work
  arrangement, site names) with synthetic fixture pages modeled on the shapes in §1. They don't
  use copies of real postings.
- **Fetcher tests** run a local HTTP server for redirects, size and time limits, content types,
  and compression. The address check is a separate pure function with its own tests. The
  fetcher takes the check as a dependency, so tests can allow `127.0.0.1` without weakening
  production.
- **Playwright** serves fixture postings from a small local server, and the local API allows
  that one loopback origin only when `APP_ENV=local` and `IMPORT_ALLOW_LOCAL_HOSTS` names it
  (the same pattern as `ALLOW_TEST_RESET`). In AWS the flag is ignored.
- **The deployed smoke test** adds one check: `POST /imports` without a token returns 401.
- **Live sites aren't tested in CI** (they change, and CI shouldn't depend on them). The manual
  validation checklist includes one real posting from each of the four hiring sites.

## 7. Test tags

A new feature tag, `import`, for the fetcher, the extractors, the route, the web fill logic, and
the import Playwright spec. `OpportunityForm*` and `NewOpportunity.tsx` gain the `import` tag
alongside `capture` and `edit`.
