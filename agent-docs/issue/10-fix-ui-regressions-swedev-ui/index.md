# Issue #10: Fix UI regressions after @swedev/ui migration

**Based on:** main

## Summary

Audit and fix UI regressions after switching `@swedev/ui` from a local `file:` reference to the npm package. The main risk areas are CSS layer conflicts between `@swedev/ui`'s `@layer swedev` / `@layer properties` styles and the custom daisyUI-compatible classes in `index.css`, plus visual regressions in 6 shared components in `packages/openvera/`.

## Triage Status

| Field | Value |
|-------|-------|
| **Ready to work** | Yes |
| **Risk** | Medium |
| **Scope** | `frontend/src/index.css` + 6 shared components in `packages/openvera/src/components/` |
| **Related** | #6 (Adopt @swedev/ui components), #3 (CI builds) |
| **Blocked by** | None |
| **Conflict risk** | Medium if #6 starts modifying same components |

## Plan Review

**Status:** Reviewed
**Reviewed:** 2026-03-07
**Feedback:** Expanded scope to include shared openvera package components, added baseline verification as Phase 0, fixed route count (10 routes + detail views), added test prerequisites and state coverage, corrected CSS layer specificity guidance, updated risk from Low to Medium.

## Related Files

- [plan.md](plan.md) - Full implementation plan
- [progress.md](progress.md) - Implementation progress log
