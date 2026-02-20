#!/usr/bin/env python3
"""
Fetch transactions from Enable Banking for all companies with active sessions.

Usage:
    # Fetch all companies
    python fetch_transactions.py

    # Fetch specific company
    python fetch_transactions.py --company <slug>

    # Fetch from a specific date
    python fetch_transactions.py --from 2025-01-01

    # Dry run (don't insert, just show what would be imported)
    python fetch_transactions.py --dry-run

Run via Docker:
    docker compose exec -T openvera python /vera/scripts/fetch_transactions.py
"""

import argparse
import hashlib
import logging
import sqlite3
import sys
import os
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'app'))
from config import DB_PATH
from enable_banking import EnableBankingClient, EnableBankingError

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
)
logger = logging.getLogger(__name__)


def get_db():
    """Get a database connection."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def compute_import_fingerprint(date, amount, reference, balance):
    """Compute a deterministic fingerprint for deduplication of imported transactions."""
    raw = f"{date}|{amount}|{reference or ''}|{balance or ''}"
    return hashlib.sha256(raw.encode('utf-8')).hexdigest()[:32]


def map_transaction(eb_txn):
    """Map an Enable Banking transaction to OpenVera's schema fields.

    Returns a dict with: date, amount, balance, reference, raw_reference, external_id.
    """
    # Date: prefer booking_date, fall back to value_date or transaction_date
    date = eb_txn.get('booking_date') or eb_txn.get('value_date') or eb_txn.get('transaction_date')

    # Amount: transaction_amount.amount with sign from credit_debit_indicator
    amount_obj = eb_txn.get('transaction_amount', {})
    try:
        amount = float(amount_obj.get('amount', 0))
    except (ValueError, TypeError):
        amount = 0.0

    indicator = eb_txn.get('credit_debit_indicator', '')
    if indicator == 'DBIT':
        amount = -abs(amount)
    elif indicator == 'CRDT':
        amount = abs(amount)

    # Balance after transaction
    balance = None
    bal_obj = eb_txn.get('balance_after_transaction')
    if bal_obj and isinstance(bal_obj, dict):
        try:
            balance = float(bal_obj.get('amount', 0))
        except (ValueError, TypeError):
            balance = None

    # Reference / remittance information
    remittance = eb_txn.get('remittance_information', [])
    if isinstance(remittance, list):
        reference = ' '.join(str(r) for r in remittance if r).strip()
    elif isinstance(remittance, str):
        reference = remittance.strip()
    else:
        reference = ''

    # Fall back to creditor/debtor name if no remittance info
    if not reference:
        creditor = eb_txn.get('creditor', {})
        debtor = eb_txn.get('debtor', {})
        if isinstance(creditor, dict) and creditor.get('name'):
            reference = creditor['name']
        elif isinstance(debtor, dict) and debtor.get('name'):
            reference = debtor['name']

    # External ID: prefer transaction_id, fall back to entry_reference
    external_id = eb_txn.get('transaction_id') or eb_txn.get('entry_reference')

    return {
        'date': date,
        'amount': amount,
        'balance': balance,
        'reference': reference,
        'raw_reference': reference,
        'external_id': external_id,
    }


def fetch_company_transactions(client, conn, company, date_from=None, dry_run=False):
    """Fetch and import transactions for a single company.

    Returns (imported_count, skipped_count, error_count).
    """
    cursor = conn.cursor()
    company_id = company['id']
    company_name = company['name']

    # Get the active session for this company
    cursor.execute("""
        SELECT session_id, valid_until
        FROM enable_banking_sessions
        WHERE company_id = ? AND status = 'active'
        ORDER BY created_at DESC LIMIT 1
    """, (company_id,))
    session_row = cursor.fetchone()

    if not session_row:
        logger.info("Company '%s': no active session, skipping", company_name)
        return 0, 0, 0

    session_id = session_row['session_id']

    # Check if session is still valid
    if session_row['valid_until']:
        try:
            valid_until = datetime.fromisoformat(session_row['valid_until'])
            if valid_until.tzinfo is None:
                valid_until = valid_until.replace(tzinfo=timezone.utc)
            if datetime.now(timezone.utc) > valid_until:
                logger.warning("Company '%s': session expired (%s), skipping", company_name, session_row['valid_until'])
                cursor.execute("""
                    UPDATE enable_banking_sessions SET status = 'expired'
                    WHERE session_id = ?
                """, (session_id,))
                conn.commit()
                return 0, 0, 0
        except (ValueError, TypeError):
            pass

    # Get accounts with Enable Banking mapping
    cursor.execute("""
        SELECT id, name, account_number, enable_banking_account_id
        FROM accounts
        WHERE company_id = ? AND enable_banking_account_id IS NOT NULL
    """, (company_id,))
    accounts = cursor.fetchall()

    if not accounts:
        logger.info("Company '%s': no mapped accounts, skipping", company_name)
        return 0, 0, 0

    total_imported = 0
    total_skipped = 0
    total_errors = 0

    for account in accounts:
        account_id = account['id']
        eb_account_id = account['enable_banking_account_id']
        account_name = account['name']

        # Determine date_from: use provided date or last transaction date
        fetch_from = date_from
        if not fetch_from:
            cursor.execute("""
                SELECT MAX(date) as last_date FROM transactions
                WHERE account_id = ?
            """, (account_id,))
            last_row = cursor.fetchone()
            if last_row and last_row['last_date']:
                fetch_from = last_row['last_date']

        logger.info(
            "Fetching transactions for '%s' / '%s' (from: %s)",
            company_name, account_name, fetch_from or 'all',
        )

        try:
            eb_transactions = client.get_transactions(
                eb_account_id,
                date_from=fetch_from,
            )
        except EnableBankingError as e:
            logger.error("Failed to fetch transactions for %s/%s: %s", company_name, account_name, e)
            total_errors += 1
            continue

        imported = 0
        skipped = 0

        for eb_txn in eb_transactions:
            mapped = map_transaction(eb_txn)

            if not mapped['date']:
                logger.warning("Skipping transaction without date: %s", eb_txn)
                total_errors += 1
                continue

            # Compute import fingerprint as fallback dedup
            fingerprint = compute_import_fingerprint(
                mapped['date'], mapped['amount'], mapped['reference'], mapped['balance']
            )

            if dry_run:
                logger.info(
                    "  [DRY RUN] %s | %10.2f | %s | ext_id=%s",
                    mapped['date'], mapped['amount'],
                    (mapped['reference'] or '')[:40],
                    mapped['external_id'] or 'none',
                )
                imported += 1
                continue

            try:
                cursor.execute("""
                    INSERT INTO transactions
                        (account_id, date, amount, balance, reference, raw_reference,
                         external_id, import_fingerprint)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    account_id,
                    mapped['date'],
                    mapped['amount'],
                    mapped['balance'],
                    mapped['reference'],
                    mapped['raw_reference'],
                    mapped['external_id'],
                    fingerprint,
                ))
                imported += 1
            except sqlite3.IntegrityError:
                # Duplicate (either external_id or import_fingerprint unique constraint)
                skipped += 1

        if not dry_run:
            conn.commit()

        logger.info(
            "  %s / %s: %d imported, %d duplicates skipped",
            company_name, account_name, imported, skipped,
        )
        total_imported += imported
        total_skipped += skipped

    return total_imported, total_skipped, total_errors


def main():
    parser = argparse.ArgumentParser(description='Fetch transactions from Enable Banking')
    parser.add_argument('--company', help='Fetch only for this company slug')
    parser.add_argument('--from', dest='date_from', help='Fetch transactions from this date (YYYY-MM-DD)')
    parser.add_argument('--dry-run', action='store_true', help='Show what would be imported without inserting')
    args = parser.parse_args()

    logger.info("Starting transaction fetch (database: %s)", DB_PATH)

    try:
        client = EnableBankingClient()
    except EnableBankingError as e:
        logger.error("Enable Banking not configured: %s", e)
        sys.exit(1)

    conn = get_db()
    cursor = conn.cursor()

    # Get companies to process
    if args.company:
        cursor.execute("SELECT id, slug, name FROM companies WHERE slug = ?", (args.company,))
    else:
        cursor.execute("SELECT id, slug, name FROM companies ORDER BY name")

    companies = [dict(row) for row in cursor.fetchall()]

    if not companies:
        logger.info("No companies found")
        conn.close()
        sys.exit(0)

    grand_imported = 0
    grand_skipped = 0
    grand_errors = 0

    for company in companies:
        imported, skipped, errors = fetch_company_transactions(
            client, conn, company,
            date_from=args.date_from,
            dry_run=args.dry_run,
        )
        grand_imported += imported
        grand_skipped += skipped
        grand_errors += errors

    conn.close()

    logger.info(
        "Fetch complete: %d imported, %d skipped, %d errors",
        grand_imported, grand_skipped, grand_errors,
    )

    if grand_errors > 0:
        sys.exit(1)


if __name__ == '__main__':
    main()
