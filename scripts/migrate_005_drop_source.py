#!/usr/bin/env python3
"""
Migration 005: Drop source column from documents and files tables.

The source column tracked how documents were ingested (manual, migrated, email, etc.)
but provides no value to the user. The ingest pipeline no longer needs it.

Safe to run multiple times (checks if column exists first).
Run: docker compose exec vera python /vera/scripts/migrate_005_drop_source.py
"""

import sqlite3
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'app'))
from config import DB_PATH


def migrate():
    conn = sqlite3.connect(DB_PATH)

    for table in ('documents', 'files'):
        cols = [row[1] for row in conn.execute(f'PRAGMA table_info({table})').fetchall()]
        if 'source' in cols:
            conn.execute(f'ALTER TABLE {table} DROP COLUMN source')
            print(f'Dropped {table}.source column.')
        else:
            print(f'{table}.source already removed, nothing to do.')

    conn.commit()
    conn.close()


if __name__ == '__main__':
    migrate()
