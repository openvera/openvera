# Research: Issue #13 — Deep Dive

## Scope

This deep dive covered:

- the GitHub issue description
- the existing local `plan.md`
- backend schema and route code
- frontend review, document, and transaction flows
- reporting and export paths that depend on match state

## Executive Summary

Issue #13 is real, but the impact is broader than the original description. The current codebase does not only conflate "PDF data verified" and "match approved" in one field; it also uses that same field to decide whether a document is fully done and whether accounting outputs should include the match.

The cleanest target is:

1. `documents.data_verified_at` for human verification of extracted PDF data
2. `matches.approved_at` for human approval of a document-to-transaction link
3. `documents.reviewed_at` kept only as a temporary compatibility field during the transition

The recommended workflow is sequential even though the state remains separate:

1. verify PDF data
2. match and approve

## Current-State Findings

### 1. `documents.reviewed_at` is overloaded everywhere

Observed behavior:

- the schema has only `documents.reviewed_at`; `matches` has no approval timestamp
- document endpoints read and write `reviewed_at` directly
- document lists and modals use `reviewed_at` as the main review signal

Why this matters:

- the same field currently means "the extracted data is correct"
- but in other places it also means "the match is approved"
- and in practice it becomes a proxy for "done"

### 2. Transaction review state is derived from document review

Observed behavior:

- transaction queries compute `match_reviewed_at` by selecting `d.reviewed_at` through the match table
- transaction pages render the underlag status from that derived field

Why this matters:

- a transaction can look "reviewed" even though no explicit match-approval state exists
- the UI is effectively borrowing document review to stand in for match review

### 3. `ReviewQueue` mixes two jobs and drops some necessary work

Observed behavior:

- suggested matches and unreviewed documents live in one page
- unreviewed documents are filtered with `!reviewed_at && !is_matched`

Why this matters:

- matched-but-unverified documents disappear from the queue
- once data verification and match approval are truly separated, this page becomes more confusing, not less

### 4. Reporting logic keys off `match_type`, not explicit approval

Observed behavior:

- VAT report includes `manual` and `auto`, but excludes `approved`
- SIE export uses the same logic

Why this matters:

- the issue text correctly points out the VAT bug
- the deeper problem is that `match_type` is being used as a proxy for accounting trust
- this is the wrong axis once match approval becomes a first-class state

### 5. Match approval is currently modeled as create-or-replace

Observed behavior:

- `ReviewQueue` approves a match by calling `createMatch(..., match_type: 'approved')`
- backend `create_match()` uses `INSERT OR REPLACE`

Why this matters:

- approval is not actually creation
- replacing the row is risky once matches gain their own metadata such as `approved_at`
- this would make timestamps and related metadata easy to lose silently

### 6. The repo has no general migration framework yet

Observed behavior:

- the app currently relies on runtime backfills, for example the party slug helper on startup
- issue #1 plans Alembic, but it is not yet in place

Why this matters:

- issue #13 needs schema changes now
- the plan must include a concrete migration vehicle, not just "add columns"

### 7. Test coverage is effectively absent for this area

Observed behavior:

- the only existing tests are banking-related

Why this matters:

- this issue changes schema, API semantics, UI status logic, and financial outputs
- without tests, regression risk is high

## Options Considered

### Option A: Keep one `Granska` page and only add separate fields

Pros:

- fewer UI changes
- lower immediate surface area

Cons:

- the queue still mixes two different tasks
- matched-but-unverified documents are still awkward to represent
- the mental model stays muddy

Assessment:

- technically possible, but not recommended

### Option B: Separate fields and keep the two review steps independent in the UI

Pros:

- reflects the real domain model
- users could verify data and approve matches in any order

Cons:

- encourages review of matches based on unverified data
- makes queue prioritization less clear
- preserves the current ambiguity around what should happen first

Assessment:

- valid data model, weaker workflow

### Option C: Separate fields and use a gated two-step workflow

Pros:

- clearest user story
- less noisy matching
- easier to reason about completion state
- fits the user's preferred workflow

Cons:

- larger UI change
- more explicit state transitions to implement

Assessment:

- recommended

## Recommended State Model

### Document-level state

- `data_verified_at`
  - means a human has checked extracted document data against the PDF
- `reviewed_at`
  - temporary compatibility field only
  - should be derived from the new workflow state, not written directly from controllers

### Match-level state

- `match_type`
  - keep as creation or provenance information during the transition
- `approved_at`
  - the authoritative signal that a match is trusted for accounting

## Recommended Workflow

### 1. Dataverifiering

- all new non-archived documents start here
- the user checks amount, dates, party, VAT, and type against the PDF
- action: `Verifiera PDF-data`

### 2. Matchningar

- only data-verified matchable documents proceed here
- suggested or auto matches can now be reviewed
- manual matches created by a user should be born approved

### 3. Done-state

- non-matchable document: done after data verification
- matchable document: done after data verification plus approved match state

## Key Implementation Consequences

### API

- add explicit verify-data endpoints
- add explicit approve-match endpoints
- stop using create-match as approval

### UI

- keep `Granska` as the top-level entry
- split it into two internal tabs:
  - `Dataverifiering`
  - `Matchningar`
- disable or hide matching UI until document data is verified

### Reports and Export

- VAT and SIE should use `approved_at IS NOT NULL`
- do not patch the problem by simply adding `'approved'` to existing `match_type` filters

### Compatibility

- `documents.reviewed_at` should remain available temporarily, but only as a derived field
- all direct writes to that field should be removed from route handlers

## Open Decisions

### 1. Historical `auto` matches

Question:

- should old `auto` rows be treated as approved during backfill?

Recommendation:

- no, not by default
- only backfill them as approved if the business explicitly decides that historical auto matches were already trusted

### 2. Manual matching before verification

Question:

- should the UI hard-block manual matching until the document is verified?

Recommendation:

- yes for the first version
- if a faster combined action is needed later, add an explicit "verify + approve" flow rather than bypassing the model

### 3. How long to keep `documents.reviewed_at`

Question:

- should it be removed immediately or kept for compatibility?

Recommendation:

- keep it for this issue as a derived field
- remove it in a later cleanup once all callers use the explicit workflow state

## Bottom Line

The original issue description is directionally correct, but the right fix is broader than:

- add one field to `matches`
- rename one button
- include `'approved'` in the VAT filter

The correct solution is a gated two-step review workflow backed by separate state for:

- data verification
- match approval

and a compatibility layer that keeps the current app working while the read and write paths are migrated.
