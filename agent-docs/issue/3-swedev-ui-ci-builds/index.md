# Issue #3: Make @swedev/ui available for CI builds

**Based on:** main

## Summary

Remove or update the local `file:` reference to `@swedev/ui` in `packages/openvera/package.json`, regenerate lockfiles, and update documentation. The npm package is already published and the frontend's package.json was already updated. Key insight: `@swedev/ui` may not be needed in the openvera package at all (no source imports found), so the preferred approach is to remove the dependency entirely.

## Triage Status

| Field | Value |
|-------|-------|
| **Ready to work** | Yes |
| **Risk** | Low |
| **Safe for junior** | Yes |

## Plan Review

**Status:** Reviewed
**Reviewed:** 2026-03-07
**Feedback:** Added clean-room verification step, broadened lockfile check patterns, added decision to remove unused dependency rather than repoint, fixed Docker pre-build rationale.

## Related Files

- [plan.md](plan.md) - Full implementation plan

## Related Issues

- None found
