# OpenVera — Agent Guide

Open-source Swedish bookkeeping system (bokföring). Flask backend, React frontend, SQLite database.

## Key Patterns

- **Imports**: `app/` is the working directory. All imports are bare (`from config import FILES_DIR`, `from db import get_db`). Scripts use `sys.path.insert` to add `app/` to path.
- **Icons**: Lucide React (not FontAwesome). Import from `lucide-react`.
- **UI Components**: @swedev/ui + Radix UI Themes. daisyUI-compatible CSS classes defined in `index.css`.
- **Package**: Domain components and API client are in `packages/openvera/`. Configurable base URL via `OpenVeraProvider`. No hardcoded routing or global state assumptions.

## Rules

- Schema changes must update `scripts/init_db.py`.
- **GitHub labels**: Only use labels listed in `agent-docs/github/labels.json`. Never create new labels unless explicitly instructed.
