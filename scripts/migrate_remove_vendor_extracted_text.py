#!/usr/bin/env python3
"""
Migration: Remove vendor and extracted_text columns from documents table.
Also fixes 3 outlier docs (414-416) with flat extracted_json schema.

Run: docker compose exec openvera python /vera/scripts/migrate_remove_vendor_extracted_text.py
  or: python3 scripts/migrate_remove_vendor_extracted_text.py
"""

import sqlite3
import json
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'app'))
from config import DB_PATH


def fix_flat_schema_docs(cursor):
    """Convert flat-schema extracted_json docs to standard nested format."""
    cursor.execute("""
        SELECT id, extracted_json FROM documents
        WHERE extracted_json IS NOT NULL AND extracted_json LIKE '%"vendor_org_nr"%'
    """)
    rows = cursor.fetchall()
    fixed = 0
    for row in rows:
        try:
            flat = json.loads(row['extracted_json'])
        except (json.JSONDecodeError, TypeError):
            continue

        # Skip if already nested
        if 'vendor' in flat and isinstance(flat['vendor'], dict):
            continue

        nested = {
            'document_type': 'invoice',
            'currency': flat.get('currency', 'SEK'),
            'vendor': {
                'name': flat.get('vendor', ''),
                'org_number': flat.get('vendor_org_nr', ''),
            },
            'customer': {},
            'invoice': {
                'number': flat.get('invoice_number', ''),
                'date': flat.get('invoice_date', ''),
                'due_date': flat.get('due_date', ''),
            },
            'payment': {},
            'line_items': flat.get('line_items', []),
            'totals': {
                'net': flat.get('amount_excl_vat'),
                'vat': flat.get('vat_amount'),
                'total': flat.get('total_amount'),
            },
            'extra': {},
        }

        # Move customer info
        if flat.get('customer'):
            if isinstance(flat['customer'], str):
                nested['customer']['name'] = flat['customer']
            elif isinstance(flat['customer'], dict):
                nested['customer'] = flat['customer']
        if flat.get('customer_vat'):
            nested['customer']['vat_number'] = flat['customer_vat']

        # Move payment info
        if flat.get('bankgiro'):
            nested['payment']['bankgiro'] = flat['bankgiro']
        if flat.get('iban'):
            nested['payment']['iban'] = flat['iban']

        # Move extra fields
        if flat.get('payment_terms'):
            nested['extra']['payment_terms'] = flat['payment_terms']

        # Clean up None values in totals
        nested['totals'] = {k: v for k, v in nested['totals'].items() if v is not None}

        cursor.execute(
            "UPDATE documents SET extracted_json = ? WHERE id = ?",
            (json.dumps(nested, ensure_ascii=False), row['id'])
        )
        fixed += 1

    return fixed


def migrate():
    print(f"Migrating database at {DB_PATH}")

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    # Check SQLite version supports DROP COLUMN (3.35.0+)
    version = sqlite3.sqlite_version_info
    if version < (3, 35, 0):
        print(f"ERROR: SQLite {sqlite3.sqlite_version} does not support DROP COLUMN (need 3.35.0+)")
        sys.exit(1)

    # 1. Fix flat-schema docs before dropping columns
    fixed = fix_flat_schema_docs(cursor)
    print(f"  Fixed {fixed} flat-schema extracted_json docs")

    # 2. Drop extracted_text column
    try:
        cursor.execute("ALTER TABLE documents DROP COLUMN extracted_text")
        print("  Dropped column: extracted_text")
    except sqlite3.OperationalError as e:
        if 'no such column' in str(e):
            print("  Column extracted_text already removed")
        else:
            raise

    # 3. Drop vendor column
    try:
        cursor.execute("ALTER TABLE documents DROP COLUMN vendor")
        print("  Dropped column: vendor")
    except sqlite3.OperationalError as e:
        if 'no such column' in str(e):
            print("  Column vendor already removed")
        else:
            raise

    # 4. Drop vendor index
    cursor.execute("DROP INDEX IF EXISTS idx_documents_vendor")
    print("  Dropped index: idx_documents_vendor")

    conn.commit()
    conn.close()
    print("Migration complete!")


if __name__ == "__main__":
    migrate()
