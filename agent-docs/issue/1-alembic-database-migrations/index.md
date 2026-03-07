# Issue #1: Add Alembic database migrations

**Based on:** main

## Summary

Add Alembic for SQLite migration management, replacing manual ALTER TABLE statements. Creates an initial migration from the current schema, unifies the bootstrap path so Alembic is the single schema source, adds a Docker migration service, and documents the workflow. Uses raw SQL migrations (no ORM) to match the existing codebase patterns.

## Triage Status

| Field | Value |
|-------|-------|
| **Ready to work** | Yes |
| **Risk** | Medium |
| **Blocked by** | None |
| **Scope** | 15 files (backend infra, Docker, scripts, tests) |
| **Conflict risk** | Low — issue #3 also edits Dockerfile/README but in different areas |

## Plan Review

**Status:** Reviewed
**Reviewed:** 2026-03-07
**Feedback:** Addressed 5 findings: unified bootstrap path (init_db.py wraps Alembic), added party slug data migration before removing runtime backfill, fixed Docker volume mounts and path resolution, added missing files (app.py, setup.sh, tests), raised risk to Medium due to dual-bootstrap transition.

## Related Files

- [plan.md](plan.md) - Full implementation plan
- [progress.md](progress.md) - Implementation progress log
