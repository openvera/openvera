# Issue #13: Separate document data verification from match approval

**Based on:** main

## Summary

The current review workflow uses a single `reviewed_at` timestamp on documents to represent multiple distinct states: verifying extracted PDF data, approving document-transaction matches, and deciding whether a document is effectively done. The rewritten plan moves this to a gated two-step workflow: first `Dataverifiering`, then `Matchningar`, with separate backend state for each step.

## Triage Status

| Field | Value |
|-------|-------|
| **Ready to work** | Yes |
| **Risk** | High |
| **Scope** | Backend schema, API contract, review UI, reports/export |
| **Conflict risk** | Low |

## Plan Review

**Status:** Reviewed
**Reviewed:** 2026-03-19
**Feedback:** Deep-dive completed. Plan rewritten around a gated two-step workflow, explicit match approval state, compatibility handling for `documents.reviewed_at`, and downstream fixes for VAT report plus SIE export.

## Related Files

- [plan.md](plan.md) - Full implementation plan
- [research.md](research.md) - Deep-dive analysis and design rationale
- [progress.md](progress.md) - Implementation progress log
