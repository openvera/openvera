# Issue #15: Match transaction search in document modal feels broken

**Based on:** main

## Summary

Improve the `MatchTransactionSection` UX so that loading states are visible in the results area, repeated empty searches give contextual feedback, and the section collapses when auto-search finds nothing. Frontend-only change in `DocumentDetailModal.tsx`.

## Triage Status

| Field | Value |
|-------|-------|
| **Ready to work** | Yes |
| **Blocked by** | None |
| **Related issues** | #13 (closed, context only — gates section behind verification) |
| **Risk** | Low |
| **Complexity** | Low-Medium (several async UI states) |
| **Scope** | 1 file (`packages/openvera/src/components/DocumentDetailModal.tsx`) |
| **Conflict risk** | Low |

## Plan Review

**Status:** Reviewed
**Reviewed:** 2026-03-19
**Feedback:** Added explicit state model, merged duplicate loading steps, covered edge cases (blank queries, no-amount docs, concurrent searches), added triage metadata, clarified that button already has loading state and the gap is the results area.

## Related Files

- [plan.md](plan.md) - Full implementation plan
- [progress.md](progress.md) - Implementation progress log
