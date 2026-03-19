# Issue #16: Document shows wrong PDF — file_id mapping points to unrelated file

**Based on:** main

## Summary

Document #529 points to file_id 460 which serves an unrelated PDF (E.ON invoice instead of npm receipt). The hash-based file deduplication trusts MD5 alone without secondary validation (file size), allowing collisions or filepath rewrites to silently merge unrelated files. Fix centralizes dedup into one function with hash+size validation, drops the UNIQUE constraint on `content_hash`, and adds diagnostic/repair endpoints. Starts with a forensic investigation of the actual broken row before committing to the implementation.

## Triage Status

| Field | Value |
|-------|-------|
| **Ready to work** | Yes |
| **Risk** | Medium |

## Plan Review

**Status:** Reviewed
**Reviewed:** 2026-03-19
**Feedback:** Added Phase 0 forensic step, centralized dedup with size validation, fixed inbox scan bypass, replaced `{hash}:{size}` disambiguator with schema change (drop UNIQUE), expanded file scope to include `init_db.py`/`app.py`/`reorganize_files.py`, aligned route naming with existing convention.

## Related Files

- [plan.md](plan.md) - Full implementation plan
- [progress.md](progress.md) - Implementation progress log
