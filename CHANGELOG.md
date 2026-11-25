# Release notes

Changes copied over from the private repo, newest first. Each update is a single commit and a
release.

## v1.1.0 (2026-11-25)

### Added

- **Offers, compared side by side** (feature 013):
  - Each opportunity has an **Offer** section for the offer it received, apart from the
    posting's salary range. It holds the base salary, bonus %, sign-on bonus, equity, 401k,
    insurance, location, work arrangement, title, role, PTO, leadership, culture, start date and
    respond-by date.
  - Every saved change is kept in the offer's history, for example "Base salary: 160,000 →
    170,000".
  - **Custom fields** are added once and every offer gets them, such as the commute or tuition
    support. They can be renamed, reordered and removed. A removed field keeps its name in the
    history.
  - The new **Offers** page lists every offer. Tick up to three, there or on the board's Offer
    column, and choose **Compare**.
  - The comparison shows each detail of each offer side by side. Score each detail from 1
    (worst) to 5 (best), or 0 when it isn't offered. Each score tints its cell from red to green,
    meeting WCAG AA contrast in light and dark mode, and each offer gets an overall score.
  - Cards and the Offers page show "Respond by", in the warning colour within 3 days.
  - Claude can list, record, change and score offers, and add or rename custom fields. Deleting
    stays in the web app.
- **Interview details** (feature 012):
  - Each interview has its own page with its kind, format, whether it was a panel, how it went,
    next steps, a note, and the interviewers (name, title, email, phone, LinkedIn).
  - Interviews can be added ahead of time. Cards show "Next interview: …" when one is coming up.
  - Claude can add and change them.
- **README:** a diagram of what's stored, and screenshots of the offer pages.

### Changed

- The card's badge says "2 completed interviews", so upcoming ones aren't counted.

### Fixed

- **Bottom navigation on phones:** the comparison's first column, and on the board each card's
  "Move to…" button, were drawn over the navigation bar, so a tap on "Overview" could land on
  the page. The bar now stays on top. A new end-to-end test checks each of its links on the
  iPhone.
- **Renaming a custom field** to the name of a field listed after it is now refused on the form,
  instead of failing when saved.

## v1.0.1 (2026-11-06)

### Fixed

- **"Move to…" dialog on the board:** while the dialog was open, the "Move to…" buttons on
  other cards showed on top of it. The dialog and its dimmed backdrop now cover the whole
  board, on desktop and on phones. A new end-to-end test checks that nothing on another card
  shows through.

### Added

- These release notes, also published on the Releases page.
- README badges: CI and secret-scan status, code coverage, mutation score, latest release,
  license, and the main technologies.

## v1.0.0 (2026-11-04)

- First public release.
