# OpenVera — Agent Guide

Open-source Swedish bookkeeping system (bokföring). Flask backend, React frontend, SQLite database. Manages companies, bank transactions, invoices/receipts, and matches them together for accounting.

## Architecture

- `app/config.py` — shared `BASE_DIR` (DB), `FILES_DIR` (documents), `DB_PATH` from env vars
- `app/app.py` — Flask setup, blueprint registration
- `app/db.py` — `get_db()` context manager + all query helpers
- `app/routes/` — one blueprint per domain, registered in `app.py`
- `packages/openvera/` — Reusable React components, API client, types, and hooks (npm package, not published)
- `frontend/` — OpenVera's own web app, imports from the `openvera` package
- `scripts/` — CLI tools. Use `sys.path.insert` to import from `app/`.

## Key Patterns

- **Imports**: `app/` is the working directory. All imports are bare (`from config import FILES_DIR`, `from db import get_db`). Scripts use `sys.path.insert` to add `app/` to path.
- **Database**: Always use `with get_db() as conn:` context manager. Returns `sqlite3.Row` objects. All query helpers are in `db.py`.
- **Blueprints**: Registered in `app.py`. Routes prefixed with `/api/` are JSON endpoints.
- **Icons**: Lucide React (not FontAwesome). Import from `lucide-react`.
- **UI Components**: @swedev/ui + Radix UI Themes. daisyUI-compatible CSS classes defined in `index.css`.
- **Package**: Domain components and API client are in `packages/openvera/`. Configurable base URL via `OpenVeraProvider`. No hardcoded routing or global state assumptions.

## Database

SQLite at `$OPENVERA_BASE_DIR/openvera.db`. Core relationship:

```
companies → accounts → transactions ↔ matches ↔ documents ← files
                                                  ↕
                                               parties
```

Schema defined in `scripts/init_db.py`. Document extraction data is stored in `documents.extracted_json`.

## Development

```bash
# First-time setup
./setup.sh

# Daily commands
docker compose up -d          # Start
docker compose down           # Stop
docker compose logs -f openvera   # Logs
docker compose up -d --build  # Rebuild after code changes

# Frontend development
cd frontend && npm install && npm run dev

# Build frontend (required before Docker build)
cd frontend && npm install && npm run build

# Run scripts inside container
docker compose exec openvera python /openvera/scripts/init_db.py

# Syntax check (Flask not installed locally)
python3 -m py_compile app/routes/api_documents.py
```

## Environment Variables

Defined in `app/config.py`. Defaults and descriptions in `.env.example`.

## Skills (Claude Code)

```bash
# Process inbox files
claude -p "/process-inbox" --dangerously-skip-permissions

# Match unmatched documents to bank transactions
claude -p "/match-documents" --dangerously-skip-permissions
```

## Rules

- Don't install Flask locally — use Docker for running the app, `py_compile` for syntax checks.
- Schema changes must update `scripts/init_db.py`.
- SIE4 export uses Swedish BAS-kontoplan (chart of accounts).
- Frontend must be pre-built before `docker compose build`.
