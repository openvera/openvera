#!/usr/bin/env python3
"""
Migration 003: Add Enable Banking integration tables and columns.

Adds:
- enable_banking_sessions table (consent/session tracking)
- oauth_states table (OAuth CSRF protection)
- accounts.enable_banking_account_id column
- transactions.external_id column (provider-native dedup)
- transactions.import_fingerprint column (CSV fallback dedup)
- UNIQUE indexes for dedup columns

Safe to run on populated databases. Uses IF NOT EXISTS / try-except for idempotency.
Run before app startup: docker compose exec vera python /vera/scripts/migrate_003_enable_banking.py
"""

import sqlite3
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'app'))
from config import DB_PATH


def migrate():
    print(f"Migration 003: Enable Banking integration")
    print(f"Database: {DB_PATH}")

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    # 1. Create enable_banking_sessions table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS enable_banking_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_id INTEGER NOT NULL,
            session_id TEXT NOT NULL,
            valid_until TEXT,
            status TEXT DEFAULT 'active',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (company_id) REFERENCES companies(id)
        )
    """)
    print("  [OK] enable_banking_sessions table")

    # 2. Create oauth_states table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS oauth_states (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            state TEXT NOT NULL UNIQUE,
            company_id INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            expires_at TIMESTAMP NOT NULL,
            used BOOLEAN DEFAULT 0,
            FOREIGN KEY (company_id) REFERENCES companies(id)
        )
    """)
    print("  [OK] oauth_states table")

    # 3. Add enable_banking_account_id to accounts
    try:
        cursor.execute("ALTER TABLE accounts ADD COLUMN enable_banking_account_id TEXT")
        print("  [OK] accounts.enable_banking_account_id added")
    except sqlite3.OperationalError as e:
        if "duplicate column" in str(e).lower():
            print("  [SKIP] accounts.enable_banking_account_id already exists")
        else:
            raise

    # 4. Add external_id to transactions
    try:
        cursor.execute("ALTER TABLE transactions ADD COLUMN external_id TEXT")
        print("  [OK] transactions.external_id added")
    except sqlite3.OperationalError as e:
        if "duplicate column" in str(e).lower():
            print("  [SKIP] transactions.external_id already exists")
        else:
            raise

    # 5. Add import_fingerprint to transactions
    try:
        cursor.execute("ALTER TABLE transactions ADD COLUMN import_fingerprint TEXT")
        print("  [OK] transactions.import_fingerprint added")
    except sqlite3.OperationalError as e:
        if "duplicate column" in str(e).lower():
            print("  [SKIP] transactions.import_fingerprint already exists")
        else:
            raise

    # 6. Create UNIQUE indexes for deduplication
    cursor.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_external_id
        ON transactions(account_id, external_id) WHERE external_id IS NOT NULL
    """)
    print("  [OK] idx_transactions_external_id index")

    cursor.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_import_fingerprint
        ON transactions(account_id, import_fingerprint) WHERE import_fingerprint IS NOT NULL
    """)
    print("  [OK] idx_transactions_import_fingerprint index")

    # 7. Create indexes for Enable Banking tables
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_eb_sessions_company
        ON enable_banking_sessions(company_id)
    """)
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_oauth_states_state
        ON oauth_states(state)
    """)
    print("  [OK] Enable Banking indexes")

    conn.commit()
    conn.close()

    print("\nMigration 003 completed successfully!")


if __name__ == "__main__":
    migrate()
