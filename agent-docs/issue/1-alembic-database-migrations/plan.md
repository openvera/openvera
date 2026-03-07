# Plan: Issue #1 — Add Alembic database migrations

## Goal

Introduce Alembic for SQLite schema migration management, replacing the current manual `ALTER TABLE` approach. Create an initial migration from the existing schema, integrate migrations into the Docker workflow, and document the process.

## Approach

Use Alembic in "raw SQL" mode (no SQLAlchemy ORM models). The app uses raw `sqlite3` throughout — adding a full ORM just for migrations would be unnecessary complexity. Alembic supports raw SQL migrations via `op.execute()`, which fits the existing patterns.

Key design decisions:
1. **No SQLAlchemy models** — Use `op.execute()` with raw SQL in migrations, matching the existing `db.py` pattern.
2. **Alembic config in project root** — Standard `alembic.ini` + `migrations/` directory.
3. **DB URL from env** — Reuse `OPENVERA_BASE_DIR` to construct the SQLite URL, keeping config centralized.
4. **Initial migration = current schema** — Convert the full `SCHEMA` string from `scripts/init_db.py` into the first migration, establishing a baseline.
5. **Single bootstrap path** — Rewrite `scripts/init_db.py` as a thin wrapper: `alembic upgrade head` + seed data. All schema creation flows through Alembic.
6. **Pre-Alembic DB support** — Only the *current* schema state is supported for stamping. Users on older schemas must be on the latest `init_db.py` schema before adopting Alembic. `scripts/migrate.py` auto-detects whether `alembic_version` exists and stamps if needed.

## Steps

### Phase 1: Alembic Setup

1. **Add dependencies to `requirements.txt`**:
   - `alembic>=1.13`
   - `sqlalchemy>=2.0` (required by Alembic as a dependency, even without ORM usage)

2. **Initialize Alembic** in the project root:
   - Create `alembic.ini` in project root
   - Create `migrations/` directory with `env.py` and `script.py.mako`
   - Configure `env.py` to read `OPENVERA_BASE_DIR` and construct `sqlite:///` URL pointing to `{BASE_DIR}/openvera.db`

3. **Configure `alembic.ini`**:
   - Set `script_location = migrations`
   - Set a placeholder `sqlalchemy.url` (overridden by `env.py` at runtime)
   - Set `file_template` to include date prefix for ordering: `%%(year)d%%(month).2d%%(day).2d_%%(rev)s_%%(slug)s`

### Phase 2: Initial Migration + Data Migration

4. **Create the initial baseline migration**:
   - Generate via `alembic revision -m "initial schema"`
   - Populate `upgrade()` with all `CREATE TABLE` and `CREATE INDEX` statements from `scripts/init_db.py` `SCHEMA` constant
   - Populate `downgrade()` with `DROP TABLE` and `DROP INDEX` in reverse dependency order
   - Do NOT include seed data (BAS accounts) — that stays in the bootstrap wrapper

5. **Create a data migration for party slugs**:
   - Generate via `alembic revision -m "backfill party slugs"`
   - Port the logic from `ensure_party_slugs()` in `app/db.py`: backfill `slug` for any `parties` rows where slug is NULL or empty
   - This replaces the runtime `ALTER TABLE` + backfill that currently runs on every app startup

6. **Stamp existing databases**:
   - `scripts/migrate.py` auto-detects: if `alembic_version` table doesn't exist but schema tables do, stamps `head` before running `upgrade`
   - This only works for databases already at the current schema. Document this prerequisite clearly.

### Phase 3: Unify Bootstrap Path

7. **Rewrite `scripts/init_db.py`** as a thin wrapper:
   - Run `alembic upgrade head` (via `alembic.command.upgrade`)
   - Then seed BAS accounts (`INSERT OR IGNORE`)
   - This makes Alembic the single source of schema truth
   - `setup.sh` line 145 already calls `scripts/init_db.py` — no change needed there

8. **Update test bootstrap** in `tests/test_banking.py`:
   - `_init_test_db()` currently extracts `SCHEMA` from `init_db.py` — update to use `alembic upgrade head` against the test DB, or keep extracting `SCHEMA` as a parallel path that's validated against Alembic output in CI

9. **Remove `ensure_party_slugs()`**:
   - Remove the function from `app/db.py`
   - Remove the import and call from `app/app.py` (lines 46-48)
   - Safe to remove because the data migration (step 5) handles the backfill and the initial schema already includes the `slug` column

### Phase 4: Docker Integration

10. **Create `scripts/migrate.py`** migration runner:
    - Runs `alembic upgrade head` programmatically using `alembic.command`
    - Auto-stamp logic: detect existing DB without `alembic_version` and stamp before upgrade
    - Must resolve `alembic.ini` path explicitly (Dockerfile sets `WORKDIR /openvera/app`, so use `/openvera/alembic.ini`)

11. **Update `Dockerfile`**:
    - Copy `alembic.ini` and `migrations/` into the image:
      ```dockerfile
      COPY alembic.ini /openvera/
      COPY migrations/ /openvera/migrations/
      ```

12. **Update `docker-compose.yml`**:
    - Add `migrations/` and `alembic.ini` volume mounts for dev (so migration changes don't require rebuild):
      ```yaml
      volumes:
        - ./migrations:/openvera/migrations
        - ./alembic.ini:/openvera/alembic.ini
      ```
    - Add a `migrate` service with `service_completed_successfully` dependency:
      ```yaml
      migrate:
        build: .
        command: python /openvera/scripts/migrate.py
        volumes:
          - ./data:/data
          - ./migrations:/openvera/migrations
          - ./alembic.ini:/openvera/alembic.ini
        environment:
          - OPENVERA_BASE_DIR=/data
      openvera:
        depends_on:
          migrate:
            condition: service_completed_successfully
      ```

### Phase 5: Documentation

13. **Document migration workflow** in a dedicated `docs/migrations.md`:
    - Creating new migrations: `alembic revision -m "description"`
    - Applying migrations: `alembic upgrade head` or `docker compose run --rm migrate`
    - Rolling back: `alembic downgrade -1`
    - Stamping existing DBs: `alembic stamp head`
    - Convention: use `op.execute()` with raw SQL, no ORM models
    - SQLite limitation: use `batch_alter_table()` for column modifications

14. **Update `CLAUDE.md` rule**: Schema changes must now create an Alembic migration AND update `scripts/init_db.py` SCHEMA (if the SCHEMA constant is still used by tests).

## Files Summary

| File | Action | Description |
|------|--------|-------------|
| `requirements.txt` | Edit | Add `alembic>=1.13`, `sqlalchemy>=2.0` |
| `alembic.ini` | Create | Alembic configuration |
| `migrations/env.py` | Create | Runtime config, reads `OPENVERA_BASE_DIR` |
| `migrations/script.py.mako` | Create | Migration template |
| `migrations/versions/<initial>.py` | Create | Initial schema migration |
| `migrations/versions/<slugs>.py` | Create | Party slugs data migration |
| `scripts/migrate.py` | Create | Programmatic migration runner with auto-stamp |
| `scripts/init_db.py` | Edit | Rewrite as thin wrapper: `alembic upgrade head` + seed data |
| `Dockerfile` | Edit | Copy `alembic.ini` + `migrations/` |
| `docker-compose.yml` | Edit | Add volume mounts, `migrate` service |
| `app/db.py` | Edit | Remove `ensure_party_slugs()` |
| `app/app.py` | Edit | Remove `ensure_party_slugs` import and call (lines 46-48) |
| `tests/test_banking.py` | Edit | Update `_init_test_db()` bootstrap to use Alembic |
| `docs/migrations.md` | Create | Migration workflow documentation |
| `CLAUDE.md` | Edit | Update schema change rule |

## Conflict Risk

- **Issue #3** also plans edits to `Dockerfile` and `README.md`. Changes are in different areas (comments vs COPY lines) and should merge cleanly, but coordinate if both land simultaneously.

## Risks

- **SQLite limitations**: SQLite has limited `ALTER TABLE` support (no `DROP COLUMN` before 3.35, no `ALTER COLUMN`). Alembic's `batch_alter_table()` context manager handles this via table recreation. Future migrations must use batch mode for column modifications.
- **Existing databases**: Only databases at the current `init_db.py` schema are supported for the auto-stamp path. Databases on older schemas must first be brought to current state manually or via existing ad-hoc migration scripts.
- **Dual bootstrap during transition**: Tests may temporarily need to support both paths. Validate that `alembic upgrade head` produces identical schema to the old `SCHEMA` constant.

## Test Plan

- Run `alembic upgrade head` on an empty database — verify all tables and indexes are created correctly
- Run `alembic stamp head` on an existing database — verify no schema changes, version table created
- Run `alembic downgrade base` — verify clean teardown
- Run `docker compose run --rm migrate` — verify migration runs in container
- Run `alembic upgrade head` twice — verify idempotency (second run is a no-op)
- Compare schema from `alembic upgrade head` vs old `scripts/init_db.py` SCHEMA — verify identical table structures
- Verify party slug backfill data migration works on a DB with NULL slugs
- Verify `scripts/init_db.py` wrapper produces a working DB with BAS seed data
- Verify `tests/test_banking.py` passes with updated bootstrap
