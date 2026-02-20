#!/usr/bin/env python3
"""Migrate files.filepath from absolute to relative paths.

Strips the old BASE_DIR prefix so paths are stored relative to the
current BASE_DIR, making the database portable across machines.
"""

import sqlite3
import sys
import os
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'app'))
from config import DB_PATH

OLD_PREFIX = '/Users/wingframeimac/Bokforing/'


def migrate():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    cursor.execute("SELECT id, filepath FROM files")
    rows = cursor.fetchall()

    converted = 0
    skipped = 0

    for row in rows:
        fid = row['id']
        fp = row['filepath']

        if not fp:
            skipped += 1
            continue

        # Already relative
        if not Path(fp).is_absolute():
            skipped += 1
            continue

        if fp.startswith(OLD_PREFIX):
            rel = fp[len(OLD_PREFIX):]
            cursor.execute("UPDATE files SET filepath = ? WHERE id = ?", (rel, fid))
            converted += 1
        else:
            print(f"  WARNING: unknown prefix, skipping id={fid}: {fp}")
            skipped += 1

    conn.commit()
    conn.close()

    print(f"Done. Converted: {converted}, Skipped: {skipped}")


if __name__ == '__main__':
    migrate()
