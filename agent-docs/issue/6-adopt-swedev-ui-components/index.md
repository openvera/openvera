# Issue #6: Adopt @swedev/ui components in frontend

**Based on:** main

## Summary

Replace native HTML elements with `@swedev/ui` React components across the frontend and shared openvera package. Incremental migration: buttons, then form inputs, then tables, then modals, then badges/alerts. Each phase retires corresponding daisyUI CSS classes from `index.css`.

## Triage Status

| Field | Value |
|-------|-------|
| **Ready to work** | Yes (after #10 is complete) |
| **Risk** | Medium |
| **Scope** | ~12 files across `frontend/src/pages/` and `packages/openvera/src/components/`, plus `packages/openvera/package.json` |
| **Related** | #10 (CSS regressions — do first), #3 (CI builds) |
| **Blocked by** | None (but #10 should be done first for clean baseline) |
| **Conflict risk** | High with #10 if concurrent |

## Plan Review

**Status:** Reviewed
**Reviewed:** 2026-03-07
**Feedback:** Added @swedev/ui dependency step for packages/openvera, composite search input handling, checkbox label patterns, removed Layout.tsx from scope, added peerDependency risk note.

## Related Files

- [plan.md](plan.md) - Full implementation plan
- [progress.md](progress.md) - Implementation progress log
