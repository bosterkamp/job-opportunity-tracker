# Job Opportunities Tracker Constitution

## Core Principles

### I. Pipeline-Centric Workflow

Every job opportunity MUST be in exactly one pipeline stage at any time. The pipeline
mirrors a real job search, for example Considering → Applied → Contacted → Interviewing →
Offer, plus end states such as Rejected, Withdrawn, Accepted, and Declined. Moving an
opportunity to another stage is the primary action in the product and MUST take a single,
low-friction step. The exact list of stages is defined in the feature specification.

**Rationale**: The value of the tool is knowing where each opportunity stands. If updating a
stage takes effort, the data goes stale and the tool stops being useful.

### II. History Is Never Lost

Every stage change MUST be recorded with its date and time and an optional note. The full
history of an opportunity MUST be viewable. Closed opportunities MUST be archived, not
deleted; permanent deletion is allowed only as a deliberate, confirmed user action.

**Rationale**: The timeline ("applied Sep 3, recruiter called Sep 10") is needed for
follow-ups and interview preparation, and past searches are useful reference later.

### III. Fast Capture, Progressive Detail

Creating an opportunity MUST require only the company name and the job title. All other
fields (point of contact, job description, interest level, and so on) MUST be optional and
editable at any later time. Adding a new opportunity SHOULD take under one minute.

**Rationale**: Opportunities often come up quickly. A form with many required fields
discourages capturing them at all.

### IV. Data Privacy & Ownership

All data MUST be private to its owner by default. It MUST NOT be shared with or sent to third
parties, with one exception: an assistant service that the owner connects and authorizes
themselves (for example their own Claude account) MAY receive the data it needs to answer the
owner's requests. That access MUST require the owner's sign-in on every request, MUST NOT allow
deleting data, and MUST be revocable by the owner at any time. All data MUST be stored in the
owner's own account.

**Rationale**: The app holds personal information: contacts, salary details, and candid
opinions about employers.

### V. Simplicity (YAGNI)

The product serves a single user. Each feature MUST be the smallest version that is useful.
Multi-user support, plugin systems, and speculative abstractions MUST NOT be added until a
real, documented need exists. Added complexity MUST be justified in the implementation plan.

**Rationale**: A small personal tool stays maintainable only if scope is held tightly.

### VI. Test the Rules

Stage change rules, field validation, and history recording MUST be covered by automated
tests. A change that alters these behaviors MUST update or add tests in the same change.

- **Coverage**: Automated tests MUST cover at least 80% of lines, branches, functions, and
  statements, measured across all packages together.
- **Mutation testing**: The mutation score MUST be at least 95%. Surviving mutants SHOULD be
  reviewed and fixed later: killed with a test, or, when they can't be killed because they
  don't change behavior (equivalent mutants), excluded with an inline disable comment stating
  the reason.
- **Exclusions**: Code left out of coverage or mutation testing MUST be limited to tests,
  tool configuration, and thin entry points (code that only wires things together), and
  MUST be listed in the implementation plan.

**Rationale**: These rules are what make the tracker trustworthy. They must not break
without anyone noticing. Coverage shows which code the tests run. Mutation testing shows
that the tests would actually catch a broken change.

### VII. Automated Quality Gates

- The project MUST provide one documented command each to build, lint, test, and run the
  app locally.
- Continuous integration MUST run build and lint on every pull request and every push to
  `master`. A branch push without a pull request MAY run nothing, and a newer commit MAY cancel
  the older, superseded run for the same pull request or `master`. Deploys MUST NOT be
  cancelled.
- Every test MUST be tagged with the functionality it checks, and code shared by every
  feature MUST have its own tag. On pull requests, CI MAY run only the tests
  for the functionality a change touches; a change to shared code MUST run every test.
- On pull requests, mutation testing MAY cover only the source files the change touches and
  those whose tests it changes, static mutants (code that runs once, when a module loads)
  included. A change that could affect any test (dependencies, tool configuration, test helpers)
  MUST cover every mutant. Every push to `master` MUST run the full test suite, the coverage
  threshold, and mutation testing that covers every mutant, static ones included (Principle VI),
  and nothing deploys unless they pass. A mutant's earlier result MAY be reused only while
  neither its code nor the tests that decided it have changed.
- A pull request MUST NOT be merged to `master` unless all of its checks pass.
- The build-and-check pipeline MUST be in place before any feature code is written.
- When deployment is introduced, it MUST run through the same automated pipeline and MUST
  NOT be done by hand.

**Rationale**: Automated checks catch problems early and keep every merged change in a
working state. Running only the affected tests keeps feedback fast; the full run on `master`
catches anything the tags miss before it reaches the deployed app.

## Scope & Data Constraints

- The product is for one person's job search. No accounts, roles, or sharing between users.
- Required fields for an opportunity: company name and job title. Every other field is
  optional.
- Each opportunity has one current stage and an ordered stage history (Principles I and II).
- Technology choices, hosting, and infrastructure are decided in implementation plans, not
  in this constitution.

## Development Workflow

- All features follow the Spec Kit flow: specify → (clarify) → plan → tasks → implement.
- Each completed step is committed and pushed to the GitHub repository.
- Each feature is developed on its own branch and merged to `master` through a pull request
  that has passed all quality gates (Principle VII).
- Every implementation plan MUST include a Constitution Check confirming compliance with
  these principles, or recording and justifying any exception.
- When a feature is done, the architecture diagrams (the README's Architecture section, and
  any other diagram of the system) MUST be updated to match what was built, in the same pull
  request. A feature that changes nothing they show MUST say so in its validation record.
- Diagrams in the project's documents MUST be written as Mermaid in the Markdown, so they're
  reviewed as text in pull requests and drawn by GitHub. Image files and text drawings MUST
  NOT be used for diagrams; folder listings aren't diagrams and stay as text. A new or changed
  diagram MUST be checked to draw without errors.

## Governance

This constitution takes precedence over other project practices. Amendments are made by
updating this file through a pull request that describes the change and its reason.

Versioning follows semantic versioning:

- **MAJOR**: a principle is removed or redefined in a way that is not backward compatible.
- **MINOR**: a principle or section is added, or guidance is materially expanded.
- **PATCH**: clarifications, wording, and typo fixes.

Specs, plans, and pull requests MUST be checked against this constitution. Any violation
MUST be justified in the plan's Complexity Tracking section or fixed before merging.

**Version**: 6.0.0 | **Ratified**: 2026-10-17 | **Last Amended**: 2026-10-29
