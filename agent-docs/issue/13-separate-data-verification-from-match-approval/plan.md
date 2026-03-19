# Plan: Issue #13 — Separate document data verification from match approval

## Goal

Split the single `reviewed_at` field into two distinct review steps so users can independently (1) verify extracted document data against the PDF, and (2) approve document-transaction matches.

## Current State

- `documents.reviewed_at` — single timestamp, NULL = not reviewed. Used as proxy for both data verification and match approval.
- `documents.needs_review` — boolean, exists but barely used.
- `matches` table — has `match_type` (manual/auto/suggested/approved) and `confidence`, but no review timestamp.
- StatusBadge shows green "Matchad" only when `matched && reviewed_at` — conflating document review with match approval.
- "Godkänn" on ReviewQueue creates match with `match_type: 'approved'` but does NOT set `reviewed_at`.
- VAT report filters `match_type IN ('manual', 'auto')` — excludes `'approved'`, which is a bug.

## Approach

### Schema changes

1. Add `documents.data_verified_at TIMESTAMP` — "extracted data matches the PDF"
2. Add `matches.reviewed_at TIMESTAMP` — "this match is confirmed correct"
3. Keep `documents.reviewed_at` as a composite "fully done" flag (set automatically or manually)

### Backend changes

1. New endpoint `POST /api/document/:id/verify-data` — sets `data_verified_at`
2. Modify match approval to also set `matches.reviewed_at`
3. Auto-set `documents.reviewed_at` when both conditions met (data verified + all matches reviewed)
4. Fix VAT report to include `match_type = 'approved'`

### Frontend changes

1. Document modal: replace "Markera granskad" with "Verifiera data" (when not yet verified)
2. Document modal: show verification status badge
3. ReviewQueue: "Godkänn" should visually confirm match is approved
4. StatusBadge: update to reflect new states (data verified, match approved, fully reviewed)
5. For non-matchable doc types (contracts, statements): "Verifiera data" alone marks as reviewed

## Steps

1. Schema migration — add `data_verified_at` to documents, `reviewed_at` to matches
2. Backend — new verify endpoint, update match approval, auto-compute `reviewed_at`
3. Fix VAT report `match_type` filter to include `'approved'`
4. Frontend — update DocumentDetailModal CTA and StatusBadge
5. Frontend — update ReviewQueue to reflect new states
6. Update batch operations to support new fields

## Risks

- **Data migration**: existing `reviewed_at` values need to be migrated. For documents that are already reviewed and matched, both `data_verified_at` and `matches.reviewed_at` should be backfilled.
- **Backwards compatibility**: other views that check `reviewed_at` need to keep working during transition.

## Test Plan

- Verify new document shows neither verified nor reviewed
- Verify data → check `data_verified_at` is set, `reviewed_at` still NULL
- Approve match → check `matches.reviewed_at` is set
- Both done → check `documents.reviewed_at` auto-set
- Non-matchable doc: verify data alone sets `reviewed_at`
- VAT report includes `approved` matches
- Undo verify / undo match approval works correctly
