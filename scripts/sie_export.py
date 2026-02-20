#!/usr/bin/env python3
"""
SIE4 Export - Swedish standard format for accounting data exchange.
"""

import sqlite3
import sys
import os
from pathlib import Path
from datetime import datetime
from collections import defaultdict

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'app'))
from config import DB_PATH

def get_db():
    """Get a database connection (bare, not context manager)."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def generate_sie4(company_id, year_from, year_to):
    """Generate SIE4 format export."""
    import json

    conn = get_db()
    cur = conn.cursor()

    # Get company info
    cur.execute("SELECT * FROM companies WHERE id = ?", (company_id,))
    company = cur.fetchone()
    if not company:
        return None, "Company not found"

    # Get fiscal year info
    fiscal_start = company['fiscal_year_start'] or '01-01'
    fiscal_month = int(fiscal_start.split('-')[0])

    # Determine fiscal year boundaries
    if fiscal_month == 1:
        rar_from = f"{year_from}0101"
        rar_to = f"{year_to}1231"
    else:
        # Broken fiscal year (e.g., May-April)
        rar_from = f"{year_from}{fiscal_start.replace('-', '')}".replace('-', '')
        rar_to = f"{year_to}{fiscal_month-1:02d}30"

    # Get transactions for the period
    date_from = f"{year_from}-{fiscal_start}" if fiscal_month > 1 else f"{year_from}-01-01"
    date_to = f"{year_to + 1}-{fiscal_month-1:02d}-30" if fiscal_month > 1 else f"{year_to}-12-31"

    cur.execute("""
        SELECT t.*, a.name as account_name, a.account_number
        FROM transactions t
        JOIN accounts a ON t.account_id = a.id
        WHERE a.company_id = ?
        AND t.date >= ? AND t.date <= ?
        AND t.is_internal_transfer = 0
        ORDER BY t.date, t.id
    """, (company_id, date_from, date_to))

    transactions = cur.fetchall()

    # Load matched document VAT data per transaction
    # Only manual/auto matches (exclude suggested)
    # For one-to-many (one doc, multiple txns), allocate full VAT to earliest match
    txn_ids = [t['id'] for t in transactions]
    txn_vat = {}  # txn_id -> list of {vat_sek, net_sek, currency, vat_breakdown_json, doc_type}
    warnings = []

    if txn_ids:
        placeholders = ','.join('?' * len(txn_ids))
        cur.execute(f"""
            SELECT m.transaction_id, d.id as doc_id, d.doc_type, d.currency,
                   d.vat_amount_sek, d.net_amount_sek,
                   d.vat_breakdown_json,
                   m.matched_at,
                   (SELECT COUNT(*) FROM matches m2
                    WHERE m2.document_id = d.id
                      AND m2.match_type IN ('manual', 'auto')) as match_count
            FROM matches m
            JOIN documents d ON m.document_id = d.id
            WHERE m.transaction_id IN ({placeholders})
              AND m.match_type IN ('manual', 'auto')
            ORDER BY m.matched_at ASC
        """, txn_ids)

        # Track which documents have already been allocated (for one-to-many dedup)
        allocated_docs = set()

        for row in cur.fetchall():
            txn_id = row['transaction_id']
            doc_id = row['doc_id']

            if doc_id in allocated_docs:
                # One-to-many: doc already allocated to an earlier transaction
                warnings.append(f"Doc #{doc_id} matched to multiple transactions; VAT allocated to first match only (skipped for txn #{txn_id})")
                continue

            if row['match_count'] > 1:
                warnings.append(f"Doc #{doc_id} is matched to {row['match_count']} transactions; VAT allocated to txn #{txn_id} (first match)")

            allocated_docs.add(doc_id)

            if row['vat_amount_sek'] is not None and row['vat_amount_sek'] != 0:
                if txn_id not in txn_vat:
                    txn_vat[txn_id] = []
                txn_vat[txn_id].append({
                    'vat_sek': row['vat_amount_sek'],
                    'net_sek': row['net_amount_sek'] or 0,
                    'currency': row['currency'],
                    'vat_breakdown_json': row['vat_breakdown_json'],
                    'doc_type': row['doc_type'],
                })

    # Load BAS accounts from database
    cur.execute("SELECT code, name FROM bas_accounts")
    bas_accounts = {row['code']: row['name'] for row in cur.fetchall()}

    conn.close()

    # Build SIE file
    lines = []

    # Header
    lines.append('#FLAGGA 0')
    lines.append('#PROGRAM "Vera" "1.0"')
    lines.append('#FORMAT PC8')
    lines.append('#GEN ' + datetime.now().strftime('%Y%m%d'))
    lines.append('#SIETYP 4')
    lines.append(f'#FNAMN "{company["name"]}"')
    if company['org_number']:
        lines.append(f'#ORGNR {company["org_number"].replace("-", "")}')

    # Fiscal year
    lines.append(f'#RAR 0 {rar_from} {rar_to}')

    # Account definitions
    lines.append('')
    lines.append('# Kontodefinitioner')

    # Collect unique accounts used (including VAT accounts)
    accounts_used = set()
    for t in transactions:
        if t['accounting_code']:
            accounts_used.add(t['accounting_code'])
    # VAT accounts will be added below when generating entries

    # Add standard accounts plus used ones
    all_accounts = {**bas_accounts}
    for code in accounts_used:
        if code not in all_accounts:
            all_accounts[code] = 'Okänt konto'

    # Ensure VAT accounts are always included
    for code in ('2610', '2611', '2612', '2620', '2640'):
        if code not in all_accounts:
            all_accounts[code] = bas_accounts.get(code, 'Momskonto')

    for code in sorted(all_accounts.keys()):
        name = all_accounts[code]
        lines.append(f'#KONTO {code} "{name}"')

    # Verifications (transactions)
    lines.append('')
    lines.append('# Verifikationer')

    ver_num = 1
    for t in transactions:
        date_str = t['date'].replace('-', '')
        account = t['accounting_code'] or '4000'  # Default to 4000 if not categorized
        amount = t['amount']

        ref = (t['reference'] or '').replace('"', "'")[:40]

        lines.append(f'#VER A {ver_num} {date_str} "{ref}"')
        lines.append('{')

        vat_docs = txn_vat.get(t['id'], [])

        if amount < 0 and vat_docs:
            # Expense with VAT data: 3-line entry (or more for multiple docs)
            total_vat_sek = sum(d['vat_sek'] for d in vat_docs)
            net_amount = abs(amount) - total_vat_sek

            # Line 1: Expense account (debit net)
            lines.append(f'   #TRANS {account} {{}} {net_amount:.2f}')

            # Line 2: VAT account(s) (debit VAT)
            # For incoming VAT: 2620 domestic, 2640 foreign
            for doc in vat_docs:
                vat_account = '2640' if doc['currency'] and doc['currency'] != 'SEK' else '2620'
                lines.append(f'   #TRANS {vat_account} {{}} {doc["vat_sek"]:.2f}')

            # Line 3: Bank account (credit gross)
            lines.append(f'   #TRANS 1930 {{}} {amount:.2f}')

        elif amount > 0 and vat_docs:
            # Income with VAT data: multi-line entry
            income_account = account if account.startswith('3') else '3000'

            # Line 1: Bank account (debit gross)
            lines.append(f'   #TRANS 1930 {{}} {amount:.2f}')

            # Line 2: Income account (credit net)
            total_vat_sek = sum(d['vat_sek'] for d in vat_docs)
            net_amount = amount - total_vat_sek
            lines.append(f'   #TRANS {income_account} {{}} {-net_amount:.2f}')

            # Line 3+: VAT accounts by rate (credit VAT)
            # For outgoing VAT: rate-specific accounts (2610=25%, 2611=12%, 2612=6%)
            for doc in vat_docs:
                breakdown_json = doc.get('vat_breakdown_json')
                if breakdown_json:
                    try:
                        breakdown = json.loads(breakdown_json)
                        for entry in breakdown:
                            rate = entry.get('rate', 0)
                            entry_vat = entry.get('vat', 0)
                            if entry_vat == 0:
                                continue
                            # Map rate to outgoing VAT account
                            if rate == 25:
                                vat_acct = '2610'
                            elif rate == 12:
                                vat_acct = '2611'
                            elif rate == 6:
                                vat_acct = '2612'
                            else:
                                vat_acct = '2610'  # Default to 25% account
                            lines.append(f'   #TRANS {vat_acct} {{}} {-entry_vat:.2f}')
                    except (json.JSONDecodeError, TypeError):
                        # Fallback: single VAT line at default 25% account
                        lines.append(f'   #TRANS 2610 {{}} {-doc["vat_sek"]:.2f}')
                else:
                    # No breakdown, use default 25% account
                    lines.append(f'   #TRANS 2610 {{}} {-doc["vat_sek"]:.2f}')

        elif amount < 0:
            # Expense without VAT: 2-line entry (original behavior)
            lines.append(f'   #TRANS {account} {{}} {abs(amount):.2f}')
            lines.append(f'   #TRANS 1930 {{}} {amount:.2f}')
        else:
            # Income without VAT: 2-line entry (original behavior)
            income_account = account if account.startswith('3') else '3000'
            lines.append(f'   #TRANS 1930 {{}} {amount:.2f}')
            lines.append(f'   #TRANS {income_account} {{}} {-amount:.2f}')

        lines.append('}')
        ver_num += 1

    # Log warnings for edge cases
    if warnings:
        lines.append('')
        lines.append('# Varningar (edge cases)')
        for w in warnings:
            lines.append(f'# {w}')

    return '\n'.join(lines), None

if __name__ == '__main__':
    import sys
    company_id = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    year = int(sys.argv[2]) if len(sys.argv) > 2 else 2025
    
    content, error = generate_sie4(company_id, year, year)
    if error:
        print(f"Error: {error}")
    else:
        print(content)
