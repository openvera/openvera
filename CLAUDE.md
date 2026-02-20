# OpenVera — Agent Guide

Open-source Swedish bookkeeping system (bokföring). Flask backend, React frontend, SQLite database. Manages companies, bank transactions, invoices/receipts, and matches them together for accounting.

## Architecture

- `app/config.py` — shared `BASE_DIR` (DB), `FILES_DIR` (documents), `DB_PATH` from env vars
- `app/app.py` — Flask setup, CSRF, blueprint registration
- `app/db.py` — `get_db()` context manager + all query helpers
- `app/routes/` — one blueprint per domain (`pages`, `api_documents`, `api_transactions`, `api_parties`, `api_companies`)
- `frontend/` — React + TypeScript + Tailwind CSS + @swedev/ui
- `scripts/` — CLI tools (schema init, CSV import, SIE4 export). Use `sys.path.insert` to import from `app/`.

## Key Patterns

- **Imports**: `app/` is the working directory. All imports are bare (`from config import FILES_DIR`, `from db import get_db`). Scripts use `sys.path.insert` to add `app/` to path.
- **CSRF**: Frontend `fetch()` auto-includes CSRF token on POST/PUT/DELETE.
- **Database**: Always use `with get_db() as conn:` context manager. Returns `sqlite3.Row` objects. All query helpers are in `db.py`.
- **Blueprints**: 5 blueprints registered in `app.py`. Routes prefixed with `/api/` are JSON endpoints.
- **Icons**: Lucide React (not FontAwesome). Import from `lucide-react`.
- **UI Components**: @swedev/ui + Radix UI Themes. daisyUI-compatible CSS classes defined in `index.css`.

## Database

SQLite at `$OPENVERA_BASE_DIR/openvera.db`. Core relationship:

```
companies → accounts → transactions ↔ matches ↔ documents ← files
                                                  ↕
                                               parties
```

11 tables: `companies`, `accounts`, `transactions`, `files`, `documents`, `matches`, `transfers`, `parties`, `party_relations`, `bas_accounts`, `inbox`.

Document extraction data is stored in `documents.extracted_json`.

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
docker compose exec openvera python /vera/scripts/init_db.py

# Syntax check (Flask not installed locally)
python3 -m py_compile app/routes/pages.py
```

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `OPENVERA_BASE_DIR` | `./data` | Base directory for database |
| `OPENVERA_FILES_DIR` | `$OPENVERA_BASE_DIR/files` | Document file storage |
| `SECRET_KEY` | random | Flask session secret (set in `.env`) |
| `OPENVERA_PORT` | `8888` | Application port |
| `OPENVERA_ENV` | `prod` | Runtime mode (`dev` enables auto-reload) |

## Docker

The Dockerfile requires a pre-built frontend. Build the frontend locally before building the Docker image:

```bash
cd frontend && npm install && npm run build
docker compose up -d --build
```

This is because `@swedev/ui` is a local `file:` dependency that can't resolve inside the Docker build context.

## Skills (Claude Code)

```bash
# Process inbox files
claude -p "/process-inbox" --dangerously-skip-permissions

# Match unmatched documents to bank transactions
claude -p "/match-documents" --dangerously-skip-permissions
```

## Rules

- Don't install Flask locally — use Docker for running the app, `py_compile` for syntax checks.
- Schema changes must update both the migration and `scripts/init_db.py`.
- SIE4 export uses Swedish BAS-kontoplan (chart of accounts).
- Frontend must be pre-built before `docker compose build`.
