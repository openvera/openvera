# Issue #13: Separate document data verification from match approval

**Based on:** main

## Summary

The current review workflow uses a single `reviewed_at` timestamp on documents to represent two distinct actions: verifying that extracted data matches the source PDF, and confirming that a document-transaction match is correct. This conflation causes confusing UI, incorrect status displays, and a bug where approved matches are excluded from VAT reports.

## Triage Status

| Field | Value |
|-------|-------|
| **Ready to work** | Yes |
| **Risk** | Medium |

## Plan Review

**Status:** Draft

## Related Files

- [plan.md](plan.md) - Full implementation plan
- [progress.md](progress.md) - Implementation progress log
