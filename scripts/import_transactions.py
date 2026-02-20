#!/usr/bin/env python3
"""
Import transactions from bank CSV files with duplicate detection.
"""

import hashlib
import sqlite3
import csv
import sys
import os
from pathlib import Path
from datetime import datetime

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'app'))
from config import DB_PATH

def get_db():
    """Get a database connection (bare, not context manager)."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def compute_import_fingerprint(date, amount, reference, balance):
    """Compute a deterministic fingerprint for deduplication of imported transactions."""
    raw = f"{date}|{amount}|{reference or ''}|{balance or ''}"
    return hashlib.sha256(raw.encode('utf-8')).hexdigest()[:32]

def parse_handelsbanken_csv(filepath):
    """Parse Handelsbanken transaction CSV."""
    transactions = []
    
    # Try different encodings
    for encoding in ['utf-8-sig', 'iso-8859-1', 'cp1252']:
        try:
            with open(filepath, 'r', encoding=encoding) as f:
                f.read(100)  # Test read
            break
        except UnicodeDecodeError:
            continue
    
    with open(filepath, 'r', encoding=encoding) as f:
        # Skip sep= line if present
        first_line = f.readline()
        if not first_line.startswith('sep='):
            f.seek(0)
        
        reader = csv.DictReader(f, delimiter=';')
        
        for row in reader:
            # Find the right column names (encoding varies)
            def get_col(row, *names):
                for name in names:
                    for key in row.keys():
                        if name.lower() in key.lower():
                            return row[key]
                return ''
            
            # Skip header/summary rows (no date)
            date = get_col(row, 'bokföringsdag', 'bokforingsdag')
            if not date or date == '':
                continue
            
            amount_str = get_col(row, 'insättning', 'insattning', 'uttag')
            if not amount_str:
                continue
                
            # Parse amount (Swedish format: -1 234,56)
            amount = float(amount_str.replace(' ', '').replace(',', '.'))
            
            balance_str = get_col(row, 'bokfört saldo', 'bokfort saldo')
            try:
                balance = float(balance_str.replace(' ', '').replace(',', '.')) if balance_str and balance_str != '*' else None
            except ValueError:
                balance = None
            
            reference = get_col(row, 'referens').strip()
            account_num = get_col(row, 'kontonr').strip()
            
            transactions.append({
                'account_num': account_num,
                'date': date,
                'amount': amount,
                'balance': balance,
                'reference': reference,
            })
    
    return transactions

def import_csv(filepath, dry_run=True):
    """Import transactions from CSV file."""
    filepath = Path(filepath)
    if not filepath.exists():
        print(f"File not found: {filepath}")
        return
    
    print(f"Parsing {filepath.name}...")
    transactions = parse_handelsbanken_csv(filepath)
    print(f"Found {len(transactions)} transactions in file")
    
    if not transactions:
        print("No transactions found!")
        return
    
    conn = get_db()
    cur = conn.cursor()
    
    # Look up account by account_number in the database
    account_num = transactions[0]['account_num']
    cur.execute("""
        SELECT a.id, a.name, c.slug
        FROM accounts a
        JOIN companies c ON a.company_id = c.id
        WHERE a.account_number = ?
    """, (account_num,))

    row = cur.fetchone()
    if not row:
        print(f"Unknown account number: {account_num}")
        print("Add it to the accounts table in the database.")
        return

    account_id = row['id']
    print(f"Account: {row['slug']} / {row['name']} (id={account_id})")
    
    imported = 0
    skipped = 0
    
    for txn in transactions:
        fingerprint = compute_import_fingerprint(
            txn['date'], txn['amount'], txn['reference'], txn['balance']
        )
        try:
            if not dry_run:
                cur.execute("""
                    INSERT INTO transactions (account_id, date, amount, balance, reference, raw_reference, import_fingerprint)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (account_id, txn['date'], txn['amount'], txn['balance'],
                      txn['reference'], txn['reference'], fingerprint))
            imported += 1
        except sqlite3.IntegrityError:
            # Duplicate (import_fingerprint or other unique constraint) - skip
            skipped += 1
    
    if not dry_run:
        conn.commit()
    conn.close()
    
    print(f"\nResult: {imported} imported, {skipped} duplicates skipped")
    if dry_run:
        print("[DRY RUN] Run with --apply to import")

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: import_transactions.py <csv_file> [--apply]")
        sys.exit(1)
    
    filepath = sys.argv[1]
    dry_run = '--apply' not in sys.argv
    import_csv(filepath, dry_run=dry_run)
