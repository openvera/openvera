# Plan: Issue #16 — Document shows wrong PDF — file_id mapping points to unrelated file

## Goal

Fix the root cause that allows documents to link to the wrong file via `file_id`, and provide tooling to detect and repair existing mismatches.

## Triage Info

| Field | Value |
|-------|-------|
| **Blocked by** | None |
| **Related issues** | #1 (Alembic migrations — schema overlap), #13 (review workflow — same files touched) |
| **Scope** | `app/db.py`, `app/routes/api_documents.py`, `scripts/init_db.py`, `app/app.py`, `scripts/reorganize_files.py` |
| **Risk** | Medium (hash transition, dedup behavior change) |
| **Conflict risk** | Low (#1 not started, #13 already merged) |
| **Safe for junior** | Yes (after Phase 0 forensic investigation is done) |

## Approach

The `content_hash`-based deduplication trusts hash equality alone across **four** code paths. The fix centralizes dedup logic into one function, adds secondary validation (file size), and provides diagnostic + repair tooling.

Before implementing, Phase 0 forensically investigates the actual broken row (doc #529 / file #460) to confirm the root cause — an MD5 collision is possible but unlikely; filepath rewrites (`scripts/reorganize_files.py`) or on-disk file replacement are alternative explanations.

### Root cause analysis

There are **four code paths** that perform hash-based dedup:

1. **`get_or_create_file()`** (`app/db.py:571-610`) — checks `content_hash` in `files` table; returns existing `id` on match without verifying actual file content or size.
2. **`api_upload_document()`** (`app/routes/api_documents.py:252-268`) — separate pre-check: queries `files WHERE content_hash = ?` and short-circuits with `duplicate: True` before `get_or_create_file()` is even called.
3. **Inbox scan `known_hashes` set** (`app/routes/api_documents.py:654-699`) — builds an in-memory `known_hashes` set and skips files whose hash is already in the set, **before** `get_or_create_file()` runs. This path completely bypasses any size validation added to `get_or_create_file()`.
4. **`api_file_tree()` / `scripts/reorganize_files.py`** — read-only hash comparisons for duplicate display and file reorganization. Not a write path, but affected by hash format changes.

All write paths trust MD5 hash alone. The `content_hash TEXT UNIQUE` constraint on the `files` table means only one file record can exist per hash, so a collision silently merges unrelated files.

## Steps

### Phase 0: Forensic investigation (confirm root cause)

1. **Query production DB** to understand the broken mapping:
   ```sql
   SELECT d.id, d.file_id, d.doc_type, d.amount, d.party_id,
          f.filepath, f.content_hash, f.file_size
   FROM documents d JOIN files f ON d.file_id = f.id
   WHERE d.id = 529;
   ```
2. **Check if multiple documents share file_id 460**:
   ```sql
   SELECT d.id, d.doc_type, d.amount FROM documents d WHERE d.file_id = 460;
   ```
3. **Check if file on disk matches the stored hash**:
   - Read the file at the stored filepath, compute its MD5, compare against `content_hash`.
4. **Check `scripts/reorganize_files.py` history** — this script moves files and updates `files.filepath`. If it ran after the document was created, it may have swapped paths.
5. **Document findings** in `progress.md` before proceeding.

### Phase 1: Centralize dedup logic

6. **Create a single dedup function** in `app/db.py`:
   ```python
   def find_duplicate_file(content_hash: str, file_size: int | None) -> int | None:
       """Return file ID if an exact duplicate exists (hash AND size match), else None."""
   ```
   - Query: `SELECT id, file_size FROM files WHERE content_hash = ?`
   - If hash matches AND `file_size` matches (or both are NULL), return the existing ID.
   - If hash matches but sizes differ, return `None` (not a true duplicate).

7. **Replace all inline dedup checks** with calls to `find_duplicate_file()`:
   - `get_or_create_file()` (`app/db.py`) — replace the hash-only `SELECT id FROM files WHERE content_hash = ?` block.
   - `api_upload_document()` (`app/routes/api_documents.py:252-268`) — replace the inline hash check.
   - Inbox scan (`app/routes/api_documents.py:654-699`) — replace the `known_hashes` set with a `known_files` dict keyed on `(content_hash, file_size)`.

### Phase 2: Schema changes

8. **Drop `UNIQUE` constraint on `content_hash`** in `scripts/init_db.py`:
   - Change `content_hash TEXT UNIQUE` → `content_hash TEXT` in the `files` table.
   - Add a non-unique index: `CREATE INDEX IF NOT EXISTS idx_files_content_hash ON files(content_hash);`
   - This allows two files with the same hash but different sizes to coexist.

9. **Add `processed_at` to schema** if missing from `files` table in `scripts/init_db.py` (it's written to at `api_documents.py:359` but not in the CREATE TABLE).

10. **Add runtime migration** in `app/db.py` (called from `app/app.py` at startup):
    - `ensure_file_schema()` — checks if `content_hash` still has a UNIQUE constraint and drops it if so. Backfills `file_size` for any rows where it's NULL by reading files from disk.

### Phase 3: Diagnostic and repair tooling

11. **Add diagnostic endpoint `GET /api/files/integrity`** (`app/routes/api_documents.py`)
    - For each file record, verify:
      - The file exists on disk at `filepath`
      - The stored `content_hash` matches the actual file's hash
      - The stored `file_size` matches the actual file's size
    - Return a list of mismatches with `file_id`, `filepath`, expected vs actual hash/size, and linked `document_id`s.
    - Paginate with `?limit=100&offset=0` for large datasets.

12. **Add re-link endpoint `PUT /api/document/<doc_id>/relink`** (`app/routes/api_documents.py`)
    - Follows existing route convention (`/api/document/<id>/...`).
    - Accepts `{ "file_id": <new_file_id> }` in body.
    - Validates both the document and the target file exist.
    - Updates `documents.file_id` to the new value.

### Phase 4: Update hash consumers

13. **Update `scripts/reorganize_files.py`** — ensure it uses the same hash function as `get_or_create_file()`. Extract a shared `compute_file_hash()` utility in `app/db.py`.

14. **Update `api_file_tree()`** duplicate detection — it reads `content_hash` for display purposes. No logic change needed, but verify it still works correctly without the UNIQUE constraint.

### Phase 5: Tests

15. **Create `tests/test_file_dedup.py`**:
    - **Hash+size match** → dedup correctly (returns existing file ID)
    - **Hash match, size mismatch** → creates new file record
    - **No hash match** → creates new file record
    - **NULL file_size** on existing row → treats as no match (safe fallback)
    - **Upload endpoint** dedup with size mismatch → saves new file instead of returning `duplicate: True`
    - **Inbox scan** dedup with `(hash, size)` keying
    - **Integrity endpoint** → detects wrong hash, missing file, wrong size
    - **Relink endpoint** → validates doc and file exist, updates mapping

## Risks

- **Dropping `UNIQUE` on `content_hash`**: The constraint currently prevents duplicate file records. After removal, dedup depends entirely on application logic. Mitigated by the centralized `find_duplicate_file()` function.
- **Existing data**: Files with NULL `file_size` won't match the new dedup logic until backfilled. The runtime migration in Phase 2 handles this.
- **`scripts/reorganize_files.py`**: This script moves files and updates paths. If it contributed to the original bug, the forensic phase will reveal it and the plan may need adjusting.
- **Data fix for doc #529**: Phase 0 confirms the root cause; the relink endpoint (Phase 3) or direct SQL provides the repair mechanism.

## Test Plan

- Run `tests/test_file_dedup.py` for all dedup, integrity, and relink tests
- Manual: upload the exact same file twice → should dedup correctly
- Manual: upload two different files of different sizes → should create two records
- Manual: call `GET /api/files/integrity` on production DB to identify existing mismatches
- Manual: use `PUT /api/document/529/relink` to fix the known broken mapping (after forensic phase confirms the correct file_id)
