# Plan: Issue #13 — Separate document data verification from match approval

## Summary

Issue #13 is not just a label or CTA cleanup. The current app overloads `documents.reviewed_at` for three different meanings:

1. The extracted PDF data has been checked by a human
2. A document-to-transaction link has been approved
3. The document is safe to include in downstream accounting outputs

The target state is a gated two-step workflow:

1. Verify PDF data on the document
2. Match and approve the transaction link

These remain separate pieces of state in the database, but the user workflow should move through them in order.

## Triage Info

| Field | Value |
|-------|-------|
| **Blocked by** | None |
| **Blocks** | None |
| **Related issues** | #1 Add Alembic database migrations |
| **Scope** | Backend schema, API contract, review UI, reports/export, shared types |
| **Risk** | High |
| **Complexity** | High |
| **Safe for junior** | No |
| **Conflict risk** | Low |

### Triage Notes

Issue #1 would provide a cleaner migration path, but it is not a blocker. The repo already uses runtime schema backfills on startup, so issue #13 can land before Alembic as long as the compatibility logic is centralized and easy to replace later.

## Deep-Dive Summary

- `documents.reviewed_at` is currently used as both "data verified" and "match approved", depending on the caller.
- `ReviewQueue` mixes document review and match review into one page and hides matched-but-unverified documents.
- VAT report and SIE export use `match_type` whitelists instead of explicit approval state.
- `create_match()` uses `INSERT OR REPLACE`, which is unsafe once match rows gain their own approval metadata.
- This area has no meaningful automated test coverage today.

## Target Workflow

1. A new document enters the `Dataverifiering` queue.
2. The user compares extracted fields with the PDF and sets `documents.data_verified_at`.
3. If the document type is not matchable, the workflow ends here.
4. If the document type is matchable, the document can now participate in matching.
5. A match is considered accounting-safe only when the match row itself is approved.
6. A matchable document is fully done only when both the document data is verified and its attached match or matches are approved.

## Design Decisions

### 1. Separate workflow state from compatibility state

**Decision:** Add `documents.data_verified_at` and `matches.approved_at`, and keep `documents.reviewed_at` only as a derived compatibility field during the transition.

**Rationale:** This removes the overloaded meaning without forcing every old query and badge to be rewritten in one pass.

### 2. Gate matching after verified data

**Decision:** Matching is the second user-facing step. The UI should not ask the user to approve or create final matches before document data is verified.

**Rationale:** Match logic depends on extracted fields such as amount, date, doc type, and sometimes party. If those fields are unverified, match suggestions are noisy and the review queue becomes harder to reason about.

### 3. Use explicit approval semantics for reports

**Decision:** VAT report and SIE export should key off `approved_at IS NOT NULL`, not `match_type IN (...)`.

**Rationale:** `match_type` describes how a match entered the system; `approved_at` describes whether the match is trustworthy enough for accounting.

### 4. Stop using create-match as approve-match

**Decision:** Add an explicit match approval endpoint and convert `create_match()` to update or upsert safely.

**Rationale:** Approval is a state transition on an existing match, not creation of a new one.

## Implementation Steps

### Phase 1: Schema and Compatibility Layer

1. Add `data_verified_at TIMESTAMP` to `documents`.
2. Add `approved_at TIMESTAMP` to `matches`.
3. Update `scripts/init_db.py` so new databases include both fields.
4. Add a compatibility helper in `app/db.py`, for example `ensure_review_workflow_columns()`, and call it from app startup in the same place runtime schema backfills are already handled.
5. Backfill existing data:
   - `documents.data_verified_at = documents.reviewed_at` where `reviewed_at` is already set
   - `matches.approved_at = COALESCE(documents.reviewed_at, matches.matched_at)` for historical `match_type IN ('manual', 'approved')`
   - historical `suggested` matches stay unapproved
   - historical `auto` matches stay unapproved unless the team explicitly decides otherwise
6. Add a helper such as `refresh_document_review_state(doc_id)` that keeps `documents.reviewed_at` in sync during the transition:
   - non-matchable docs: `reviewed_at = data_verified_at`
   - matchable docs with verified data and only approved matches: set `reviewed_at`
   - otherwise: clear `reviewed_at`

### Phase 2: Backend Write Flows

1. Replace direct writes to `documents.reviewed_at` in document routes with explicit verification flows.
2. Add `POST /api/document/<id>/verify-data` and support undo via `unverify` or a paired endpoint.
3. Add `POST /api/matches/<id>/approve` and optionally `POST /api/matches/<id>/unapprove` if undo is needed without deleting the match.
4. Update manual match creation so user-created matches are born approved:
   - manual match => set `approved_at` immediately
   - suggested or auto match => leave `approved_at = NULL`
5. Replace `INSERT OR REPLACE` in `create_match()` with a safe upsert or update path so approval metadata and timestamps are not silently lost.
6. Call `refresh_document_review_state()` from every relevant mutation:
   - verify or unverify
   - create match
   - approve or unapprove
   - delete or unmatch
   - document type change
   - metadata edits that invalidate verification

### Phase 3: Backend Read Models and API Contract

1. Extend document payloads to expose:
   - `data_verified_at`
   - compatibility `reviewed_at`
   - per-match approval state on `matched_transactions`
2. Extend match payloads to expose:
   - `approved_at`
   - parent-document verification state where useful in review UI
3. Update transaction queries so `match_reviewed_at` no longer comes from `documents.reviewed_at`; it should reflect match approval.
4. Keep old response fields temporarily where useful, but stop treating them as the primary source of truth.

### Phase 4: UI Workflow and Navigation

1. Keep `Granska` as the top-level entry, but split the page into two internal tabs:
   - `Dataverifiering`
   - `Matchningar`
2. `Dataverifiering` tab:
   - show all non-archived docs where `data_verified_at IS NULL`
   - include matched docs as well, since data verification is independent
   - rename CTA from `Markera granskad` to `Verifiera PDF-data`
3. `Matchningar` tab:
   - show only matches where `approved_at IS NULL`
   - only surface match review after the parent document is data-verified
4. Update `DocumentDetailModal`:
   - show separate status for data verification and match approval
   - disable or hide matching UI until the document is verified
5. Update document and transaction badges:
   - documents should emphasize data verification and completion
   - transactions should emphasize match approval, not document review
6. Rename document-list filters from reviewed and unreviewed to verified and unverified where the list is document-centric.

### Phase 5: Reports, Export, and Downstream Logic

1. Update VAT report to include only matches with `approved_at IS NOT NULL`.
2. Update SIE export to use the same approval rule.
3. Audit any other downstream logic that currently assumes `match_type IN ('manual', 'auto')` means "ready for bookkeeping".

### Phase 6: Verification Invalidation Rules

1. If verification-relevant fields change after a document is verified, clear `data_verified_at`:
   - amount
   - currency
   - doc date
   - due date
   - invoice number
   - OCR number
   - VAT fields
   - doc type
   - party, if matching logic depends on it
2. If a verified-and-approved document changes in a way that affects match correctness, require match reapproval as part of the update flow or clear approval automatically.

## Files Summary

| File | Action | Purpose |
|------|--------|---------|
| `scripts/init_db.py` | Modify | Add `documents.data_verified_at` and `matches.approved_at` to the base schema |
| `app/app.py` | Modify | Run compatibility backfill helper on startup |
| `app/db.py` | Modify | Add schema ensure helper, safe upsert logic, and document review-state refresh |
| `app/routes/api_documents.py` | Modify | Replace direct `reviewed_at` writes with verify or unverify flows |
| `app/routes/api_transactions.py` | Modify | Add explicit match approval flow and return approval state in match payloads |
| `app/routes/api_companies.py` | Modify | Change VAT report to use approval state |
| `scripts/sie_export.py` | Modify | Change export filtering to use approval state |
| `packages/openvera/src/types.ts` | Modify | Add data-verification and match-approval fields |
| `packages/openvera/src/components/DocumentDetailModal.tsx` | Modify | Separate verify-data and match-approval UI |
| `packages/openvera/src/components/StatusBadge.tsx` | Modify or split | Stop conflating document review and match approval |
| `frontend/src/pages/ReviewQueue.tsx` | Modify | Split the page into `Dataverifiering` and `Matchningar` tabs |
| `frontend/src/pages/Documents.tsx` | Modify | Use document-verification semantics in filters and actions |
| `frontend/src/pages/Transactions.tsx` | Modify | Use match-approval semantics in transaction status |
| `frontend/src/pages/TransactionDetail.tsx` | Modify | Use match-approval semantics in detail status |

## Codebase Areas

- `app/`
- `scripts/`
- `packages/openvera/src/`
- `frontend/src/pages/`

## Risks

- Historical `auto` matches are semantically ambiguous; backfill policy must be explicit.
- Keeping `documents.reviewed_at` during the transition creates drift risk unless all writes are centralized.
- Gating matching after verification changes the user workflow and may surface edge cases in existing queues.
- This area has no meaningful automated test coverage today.
- Issue #1 could later change the migration mechanism, so the runtime backfill helper should be easy to replace.

## Verification Checklist

- [ ] New matchable document starts as unverified and unavailable for match approval
- [ ] Verifying data sets `data_verified_at` and leaves match approval untouched
- [ ] Non-matchable document becomes fully done after verification
- [ ] Manual match creation creates an approved match immediately
- [ ] Suggested or auto match approval sets `approved_at`
- [ ] Unmatching or unapproving clears compatibility `reviewed_at` when appropriate
- [ ] Transaction views only show approved matches as reviewed
- [ ] VAT report includes approved matches and excludes unapproved suggestions
- [ ] SIE export includes approved matches and excludes unapproved suggestions
- [ ] Editing verified data invalidates verification and any dependent done-state
