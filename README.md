# OpenVera

OpenVera is an open-source Swedish bookkeeping system designed for small businesses. It focuses on:

- Transaction ingestion and classification
- Document parsing and matching (invoices, receipts, contracts)
- Party/vendor mapping with pattern-based auto-matching
- Accounting exports (CSV/SIE4)
- Agent-first automation — AI handles the happy path, UI is for review and control

## Quick Start

Requires [Docker](https://docs.docker.com/get-docker/).

```bash
git clone https://github.com/openvera/openvera.git
cd openvera
./setup.sh
```

Then open `http://localhost:8888`.

The setup script will:
1. Check prerequisites (Docker, Docker Compose)
2. Generate a `.env` file from `.env.example`
3. Initialize a fresh SQLite database
4. Build and start the Docker container
5. Guide you through adding your first company

## Development

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/)
- [Node.js](https://nodejs.org/) (v22+) — for frontend development
- `@swedev/ui` — local dependency expected at `../ui` relative to the repo root (see `frontend/package.json`)

### Frontend

The frontend depends on two local packages: `packages/openvera` and `@swedev/ui` (outside the repo at `../ui`). Both must be available before `npm install` will succeed.

```bash
# Build the openvera package
cd packages/openvera && npm install && npm run build && cd ../..

# Start frontend dev server (with hot reload)
cd frontend && npm install && npm run dev
```

### Docker

```bash
docker compose up -d --build    # Rebuild and start
docker compose down              # Stop
docker compose restart openvera      # Restart
docker compose logs -f openvera      # Follow logs
```

Run scripts inside the container:

```bash
docker compose exec openvera python /openvera/scripts/<script>.py
```

The Dockerfile requires a pre-built frontend (`cd frontend && npm run build`) because `@swedev/ui` can't resolve inside the Docker build context.

## Project Structure

```text
app/
  app.py          Flask app setup + blueprint registration
  config.py       Environment-driven configuration
  db.py           Database helpers and data access
  routes/         API route modules (source of truth for endpoints)
scripts/          Import/export/init utilities
frontend/         React + Tailwind frontend (TypeScript)
tests/            Automated tests
data/             Local SQLite database (created by setup.sh)
```

## Configuration

Copy `.env.example` to `.env` (done automatically by `setup.sh`). See `.env.example` for all available variables and descriptions.

## File Storage

Document files are stored under `OPENVERA_FILES_DIR`:

```text
openvera-data/
  {company-slug}/
    {year}/
      {filename}       # All documents flat — one folder per year
  inbox/               # Unprocessed uploads
```

Paths in the database are relative and resolved at runtime via `resolve_filepath()` in `db.py`.

## Agent Integration

OpenVera is designed to work with AI agents (e.g. Claude Code skills) for automated document processing:

```bash
# Process new inbox files (read PDFs, extract data, create documents)
claude -p "/process-inbox" --dangerously-skip-permissions

# Match unmatched documents to bank transactions
claude -p "/match-documents" --dangerously-skip-permissions
```

## API

Use route files as the canonical source for endpoints:

```bash
grep -rn "@.*route(" app/routes/
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

[MIT](LICENSE)
