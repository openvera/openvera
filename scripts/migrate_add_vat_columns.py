#!/usr/bin/env python3
"""
Migration: Add VAT columns to documents table and seed BAS VAT accounts.

Adds:
  - net_amount, vat_amount, net_amount_sek, vat_amount_sek, vat_breakdown_json
    to the documents table
  - BAS accounts 2610, 2611, 2612, 2614, 2620, 2640

Backfills from extracted_json for existing documents.
"""

import json
import sqlite3
import sys
import os
from collections import defaultdict

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'app'))
from config import DB_PATH


# New VAT BAS accounts to seed
VAT_BAS_ACCOUNTS = [
    ('2610', 'Utgående moms 25%', None),
    ('2611', 'Utgående moms 12%', None),
    ('2612', 'Utgående moms 6%', None),
    ('2614', 'Utgående moms, omvänd skattskyldighet', None),
    ('2620', 'Ingående moms', None),
    ('2640', 'Ingående moms utlandet', None),
]


def add_columns(conn):
    """Add VAT columns to documents table (idempotent)."""
    cursor = conn.cursor()

    # Check existing columns
    cursor.execute("PRAGMA table_info(documents)")
    existing = {row[1] for row in cursor.fetchall()}

    new_columns = [
        ('net_amount', 'REAL'),
        ('vat_amount', 'REAL'),
        ('net_amount_sek', 'REAL'),
        ('vat_amount_sek', 'REAL'),
        ('vat_breakdown_json', 'TEXT'),
    ]

    for col_name, col_type in new_columns:
        if col_name not in existing:
            cursor.execute(f"ALTER TABLE documents ADD COLUMN {col_name} {col_type}")
            print(f"  Added column: {col_name} {col_type}")
        else:
            print(f"  Column already exists: {col_name}")

    conn.commit()


def seed_bas_accounts(conn):
    """Insert VAT BAS accounts (idempotent)."""
    cursor = conn.cursor()
    for code, name, desc in VAT_BAS_ACCOUNTS:
        cursor.execute(
            "INSERT OR IGNORE INTO bas_accounts (code, name, description) VALUES (?, ?, ?)",
            (code, name, desc)
        )
    conn.commit()
    print("  Seeded VAT BAS accounts (2610, 2611, 2612, 2614, 2620, 2640)")


def backfill_vat_data(conn):
    """Parse extracted_json and populate VAT columns for existing documents."""
    cursor = conn.cursor()

    cursor.execute("""
        SELECT id, extracted_json, amount, currency, amount_sek
        FROM documents
        WHERE extracted_json IS NOT NULL
          AND net_amount IS NULL
    """)
    rows = cursor.fetchall()

    if not rows:
        print("  No documents to backfill.")
        return

    updated = 0
    skipped = 0
    errors = 0

    for row in rows:
        doc_id = row[0]
        raw_json = row[1]
        doc_amount = row[2]
        doc_currency = row[3]
        doc_amount_sek = row[4]

        try:
            data = json.loads(raw_json)
        except (json.JSONDecodeError, TypeError):
            skipped += 1
            continue

        totals = data.get('totals') or {}
        net = totals.get('net')
        vat = totals.get('vat')

        # Skip if no VAT data at all
        if net is None and vat is None:
            skipped += 1
            continue

        # Ensure numeric types
        try:
            net = float(net) if net is not None else None
            vat = float(vat) if vat is not None else None
        except (ValueError, TypeError):
            skipped += 1
            continue

        # Derive SEK amounts
        net_sek = None
        vat_sek = None

        if doc_currency and doc_currency.upper() == 'SEK':
            net_sek = net
            vat_sek = vat
        elif doc_amount and doc_amount_sek and doc_amount != 0:
            # Use existing FX rate: amount_sek / amount
            fx_rate = doc_amount_sek / doc_amount
            if net is not None:
                net_sek = round(net * fx_rate, 2)
            if vat is not None:
                vat_sek = round(vat * fx_rate, 2)
        else:
            # No currency info or can't derive FX rate; leave SEK as None
            pass

        # Build VAT breakdown from line items
        breakdown = None
        line_items = data.get('line_items') or []
        if line_items:
            by_rate = defaultdict(lambda: {'net': 0.0, 'vat': 0.0})
            has_rate_data = False
            for item in line_items:
                rate = item.get('vat_rate')
                item_net = item.get('net')
                item_vat = item.get('vat')
                if rate is not None and (item_net is not None or item_vat is not None):
                    has_rate_data = True
                    try:
                        rate = float(rate)
                        if item_net is not None:
                            by_rate[rate]['net'] += float(item_net)
                        if item_vat is not None:
                            by_rate[rate]['vat'] += float(item_vat)
                    except (ValueError, TypeError):
                        continue

            if has_rate_data and len(by_rate) > 1:
                breakdown = json.dumps([
                    {'rate': rate, 'net': round(vals['net'], 2), 'vat': round(vals['vat'], 2)}
                    for rate, vals in sorted(by_rate.items())
                ])

        try:
            cursor.execute("""
                UPDATE documents
                SET net_amount = ?, vat_amount = ?,
                    net_amount_sek = ?, vat_amount_sek = ?,
                    vat_breakdown_json = ?
                WHERE id = ?
            """, (net, vat, net_sek, vat_sek, breakdown, doc_id))
            updated += 1
        except Exception as e:
            print(f"  Error updating doc {doc_id}: {e}")
            errors += 1

    conn.commit()
    print(f"  Backfilled {updated} documents, skipped {skipped}, errors {errors}")


def cleanup_single_rate_breakdowns(conn):
    """Remove vat_breakdown_json where it only contains a single rate (redundant with net_amount/vat_amount)."""
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id, vat_breakdown_json FROM documents
        WHERE vat_breakdown_json IS NOT NULL
    """)
    rows = cursor.fetchall()
    cleaned = 0
    for doc_id, raw in rows:
        try:
            breakdown = json.loads(raw)
            if isinstance(breakdown, list) and len(breakdown) <= 1:
                cursor.execute("UPDATE documents SET vat_breakdown_json = NULL WHERE id = ?", (doc_id,))
                cleaned += 1
        except (json.JSONDecodeError, TypeError):
            continue
    conn.commit()
    print(f"  Cleaned {cleaned} single-rate breakdowns")


def main():
    print(f"Running VAT migration on {DB_PATH}")

    conn = sqlite3.connect(DB_PATH)

    print("Step 1: Adding VAT columns...")
    add_columns(conn)

    print("Step 2: Seeding BAS VAT accounts...")
    seed_bas_accounts(conn)

    print("Step 3: Backfilling VAT data from extracted_json...")
    backfill_vat_data(conn)

    print("Step 4: Cleaning up single-rate breakdowns...")
    cleanup_single_rate_breakdowns(conn)

    conn.close()
    print("Migration complete!")


if __name__ == '__main__':
    main()
