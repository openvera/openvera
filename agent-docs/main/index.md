# Main Branch

**Branch:** main

## Overview

OpenVera is an open-source Swedish bookkeeping system (bokföringssystem) for small businesses. It uses a Flask backend with SQLite and a React + Tailwind frontend. Core capabilities:

- **Transaction ingestion** — Import and classify bank transactions
- **Document parsing and matching** — Process invoices, receipts, and contracts; match them to transactions
- **Party/vendor mapping** — Pattern-based auto-matching of counterparties
- **Accounting exports** — CSV and SIE4 (Swedish standard) output
- **Agent-first automation** — AI agents handle the happy path; the UI is for review and control

The system is designed to run via Docker, with a local SQLite database and file-based document storage.

## Context Files

(Add project-brief.md, tech-context.md, etc. as the project matures)
