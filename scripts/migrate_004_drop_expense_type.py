#!/usr/bin/env python3
"""
Migration 004: Drop transactions.expense_type column.

The expense_type column was redundant — it stored a human-readable name
that maps 1:1 to accounting_code via the bas_accounts table.

Safe to run multiple times (checks if column exists first).
Run: docker compose exec openvera python /openvera/scripts/migrate_004_drop_expense_type.py
"""

import sqlite3
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'app'))
from config import DB_PATH


def migrate():
    conn = sqlite3.connect(DB_PATH)

    # Check if column exists
    cols = [row[1] for row in conn.execute('PRAGMA table_info(transactions)').fetchall()]
    if 'expense_type' not in cols:
        print('expense_type column already removed, nothing to do.')
        conn.close()
        return

    conn.execute('ALTER TABLE transactions DROP COLUMN expense_type')
    conn.commit()
    print('Dropped transactions.expense_type column.')
    conn.close()


if __name__ == '__main__':
    migrate()
