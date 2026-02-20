"""Company and report API routes."""

from flask import Blueprint, jsonify, request, Response
from datetime import datetime
from collections import defaultdict
import json
import sys
import os

from config import BASE_DIR
from db import get_db, get_company, get_accounts, get_account_transactions, generate_slug
from routes.api_parties import parse_patterns

api_companies_bp = Blueprint('api_companies', __name__)


@api_companies_bp.route('/api/company/<slug>')
def api_company(slug):
    """API endpoint for company data."""
    company = get_company(slug)
    if not company:
        return jsonify({'error': 'Not found'}), 404

    accounts = get_accounts(company['id'])

    for account in accounts:
        account['transactions'] = get_account_transactions(account['id'])

    return jsonify({
        'company': company,
        'accounts': accounts
    })


@api_companies_bp.route('/api/companies')
def api_list_companies():
    """List all companies."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, slug, name, org_number, fiscal_year_start FROM companies ORDER BY name")
        companies = [dict(row) for row in cursor.fetchall()]
    return jsonify(companies)


@api_companies_bp.route('/api/companies', methods=['POST'])
def api_create_company():
    """Create a new company."""
    data = request.json
    name = (data.get('name') or '').strip()
    org_number = data.get('org_number')
    fiscal_year_start = data.get('fiscal_year_start', '01-01')

    if not name:
        return jsonify({'error': 'Namn krävs'}), 400

    slug = generate_slug(name)
    if not slug:
        return jsonify({'error': 'Ogiltigt namn'}), 400

    with get_db() as conn:
        cursor = conn.cursor()
        # Check slug uniqueness
        cursor.execute("SELECT id FROM companies WHERE slug = ?", (slug,))
        if cursor.fetchone():
            return jsonify({'error': 'Ett företag med liknande namn finns redan'}), 400

        cursor.execute("""
            INSERT INTO companies (slug, name, org_number, fiscal_year_start)
            VALUES (?, ?, ?, ?)
        """, (slug, name, org_number, fiscal_year_start))
        company_id = cursor.lastrowid
        conn.commit()

    return jsonify({'ok': True, 'company_id': company_id, 'slug': slug})


@api_companies_bp.route('/api/company/<slug>', methods=['PUT'])
def api_update_company(slug):
    """Update a company."""
    data = request.json
    company = get_company(slug)
    if not company:
        return jsonify({'error': 'Not found'}), 404

    name = (data.get('name') or '').strip() or company['name']
    org_number = data.get('org_number', company['org_number'])
    fiscal_year_start = data.get('fiscal_year_start', company['fiscal_year_start'])

    # Regenerate slug if name changed
    new_slug = slug
    if name != company['name']:
        new_slug = generate_slug(name)
        if not new_slug:
            return jsonify({'error': 'Ogiltigt namn'}), 400
        # Check uniqueness (only if slug actually changed)
        if new_slug != slug:
            with get_db() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT id FROM companies WHERE slug = ? AND id != ?", (new_slug, company['id']))
                if cursor.fetchone():
                    return jsonify({'error': 'Ett företag med liknande namn finns redan'}), 400

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE companies SET slug = ?, name = ?, org_number = ?, fiscal_year_start = ?
            WHERE id = ?
        """, (new_slug, name, org_number, fiscal_year_start, company['id']))
        conn.commit()

    return jsonify({'ok': True, 'slug': new_slug, 'old_slug': slug})


@api_companies_bp.route('/api/company/<slug>', methods=['DELETE'])
def api_delete_company(slug):
    """Delete a company and all related data (cascade)."""
    company = get_company(slug)
    if not company:
        return jsonify({'error': 'Not found'}), 404

    company_id = company['id']

    with get_db() as conn:
        cursor = conn.cursor()

        # Get account IDs for this company
        cursor.execute("SELECT id FROM accounts WHERE company_id = ?", (company_id,))
        account_ids = [row['id'] for row in cursor.fetchall()]

        # Get document IDs for this company
        cursor.execute("SELECT id, file_id FROM documents WHERE company_id = ?", (company_id,))
        doc_rows = cursor.fetchall()
        doc_ids = [row['id'] for row in doc_rows]
        file_ids = [row['file_id'] for row in doc_rows if row['file_id']]

        # Get transaction IDs for this company's accounts
        txn_ids = []
        if account_ids:
            placeholders = ','.join('?' * len(account_ids))
            cursor.execute(f"SELECT id FROM transactions WHERE account_id IN ({placeholders})", account_ids)
            txn_ids = [row['id'] for row in cursor.fetchall()]

        # 1. Clear related_document_id self-references
        if doc_ids:
            ph = ','.join('?' * len(doc_ids))
            cursor.execute(f"UPDATE documents SET related_document_id = NULL WHERE related_document_id IN ({ph})", doc_ids)

        # 2. Delete matches via documents
        if doc_ids:
            ph = ','.join('?' * len(doc_ids))
            cursor.execute(f"DELETE FROM matches WHERE document_id IN ({ph})", doc_ids)

        # 3. Delete matches via transactions
        if txn_ids:
            ph = ','.join('?' * len(txn_ids))
            cursor.execute(f"DELETE FROM matches WHERE transaction_id IN ({ph})", txn_ids)

        # 4. Delete transfers where from/to transaction belongs to this company
        if txn_ids:
            ph = ','.join('?' * len(txn_ids))
            cursor.execute(f"DELETE FROM transfers WHERE from_transaction_id IN ({ph}) OR to_transaction_id IN ({ph})",
                           txn_ids + txn_ids)

        # 5. Clear linked_transfer_id for this company's transactions
        if txn_ids:
            ph = ','.join('?' * len(txn_ids))
            cursor.execute(f"UPDATE transactions SET linked_transfer_id = NULL WHERE id IN ({ph})", txn_ids)

        # 6. Clear inbox.document_id for documents belonging to this company
        if doc_ids:
            ph = ','.join('?' * len(doc_ids))
            cursor.execute(f"UPDATE inbox SET document_id = NULL WHERE document_id IN ({ph})", doc_ids)

        # 7. Delete documents
        if doc_ids:
            ph = ','.join('?' * len(doc_ids))
            cursor.execute(f"DELETE FROM documents WHERE id IN ({ph})", doc_ids)

        # 8. Delete orphaned files
        if file_ids:
            for fid in file_ids:
                cursor.execute("SELECT COUNT(*) as cnt FROM documents WHERE file_id = ?", (fid,))
                if cursor.fetchone()['cnt'] == 0:
                    cursor.execute("DELETE FROM files WHERE id = ?", (fid,))

        # 9. Delete transactions
        if txn_ids:
            ph = ','.join('?' * len(txn_ids))
            cursor.execute(f"DELETE FROM transactions WHERE id IN ({ph})", txn_ids)

        # 10. Delete accounts
        if account_ids:
            ph = ','.join('?' * len(account_ids))
            cursor.execute(f"DELETE FROM accounts WHERE id IN ({ph})", account_ids)

        # 11. Delete party_relations
        cursor.execute("DELETE FROM party_relations WHERE company_id = ?", (company_id,))

        # 12. Delete the company
        cursor.execute("DELETE FROM companies WHERE id = ?", (company_id,))

        conn.commit()

    return jsonify({'ok': True})


@api_companies_bp.route('/api/company/<slug>/accounts')
def api_list_accounts(slug):
    """List accounts for a company."""
    company = get_company(slug)
    if not company:
        return jsonify({'error': 'Not found'}), 404

    accounts = get_accounts(company['id'])
    return jsonify(accounts)


@api_companies_bp.route('/api/company/<slug>/accounts', methods=['POST'])
def api_create_account(slug):
    """Create an account for a company."""
    company = get_company(slug)
    if not company:
        return jsonify({'error': 'Not found'}), 404

    data = request.json
    name = (data.get('name') or '').strip()
    account_number = data.get('account_number')
    account_type = data.get('account_type', 'bank')
    currency = data.get('currency', 'SEK')

    if not name:
        return jsonify({'error': 'Namn krävs'}), 400

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO accounts (company_id, name, account_number, account_type, currency)
            VALUES (?, ?, ?, ?, ?)
        """, (company['id'], name, account_number, account_type, currency))
        account_id = cursor.lastrowid
        conn.commit()

    return jsonify({'ok': True, 'account_id': account_id})


@api_companies_bp.route('/api/accounts/<int:account_id>', methods=['PUT'])
def api_update_account(account_id):
    """Update an account."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM accounts WHERE id = ?", (account_id,))
        account = cursor.fetchone()
        if not account:
            return jsonify({'error': 'Not found'}), 404

        data = request.json
        name = (data.get('name') or '').strip() or account['name']
        account_number = data.get('account_number', account['account_number'])
        account_type = data.get('account_type', account['account_type'])
        currency = data.get('currency', account['currency'])

        cursor.execute("""
            UPDATE accounts SET name = ?, account_number = ?, account_type = ?, currency = ?
            WHERE id = ?
        """, (name, account_number, account_type, currency, account_id))
        conn.commit()

    return jsonify({'ok': True})


@api_companies_bp.route('/api/accounts/<int:account_id>', methods=['DELETE'])
def api_delete_account(account_id):
    """Delete an account and all related data (cascade)."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM accounts WHERE id = ?", (account_id,))
        if not cursor.fetchone():
            return jsonify({'error': 'Not found'}), 404

        # Get transaction IDs
        cursor.execute("SELECT id FROM transactions WHERE account_id = ?", (account_id,))
        txn_ids = [row['id'] for row in cursor.fetchall()]

        if txn_ids:
            ph = ','.join('?' * len(txn_ids))
            # Delete transfers
            cursor.execute(f"DELETE FROM transfers WHERE from_transaction_id IN ({ph}) OR to_transaction_id IN ({ph})",
                           txn_ids + txn_ids)
            # Clear linked_transfer_id
            cursor.execute(f"UPDATE transactions SET linked_transfer_id = NULL WHERE id IN ({ph})", txn_ids)
            # Delete matches
            cursor.execute(f"DELETE FROM matches WHERE transaction_id IN ({ph})", txn_ids)
            # Delete transactions
            cursor.execute(f"DELETE FROM transactions WHERE id IN ({ph})", txn_ids)

        # Delete account
        cursor.execute("DELETE FROM accounts WHERE id = ?", (account_id,))
        conn.commit()

    return jsonify({'ok': True})


@api_companies_bp.route('/api/sie-export')
def api_sie_export():
    """Export SIE4 file for accounting software."""
    sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '..', 'scripts'))
    from sie_export import generate_sie4

    company_id = request.args.get('company_id', type=int)
    year = request.args.get('year', type=int, default=datetime.now().year)

    if not company_id:
        return jsonify({'error': 'company_id required'}), 400

    content, error = generate_sie4(company_id, year, year)

    if error:
        return jsonify({'error': error}), 400

    response = Response(content, mimetype='text/plain; charset=cp437')
    response.headers['Content-Disposition'] = f'attachment; filename=bokforing_{year}.se'
    return response


@api_companies_bp.route('/api/report/vat')
def api_vat_report():
    """Get VAT report data for momsdeklaration.

    Only includes documents matched via manual/auto matches (excludes suggested).
    Uses cash basis (transaction date) for period filtering.
    Deduplicates by document_id to avoid double-counting.
    """
    company_id = request.args.get('company_id', type=int)
    date_from = request.args.get('from')
    date_to = request.args.get('to')

    if not company_id:
        return jsonify({'error': 'company_id required'}), 400

    with get_db() as conn:
        cursor = conn.cursor()

        # Get matched documents in period (cash basis = transaction date)
        # Deduplicate by document_id — for one-to-many matches, use earliest match
        conditions = [
            "a.company_id = ?",
            "m.match_type IN ('manual', 'auto')",
        ]
        params = [company_id]

        if date_from:
            conditions.append("t.date >= ?")
            params.append(date_from)
        if date_to:
            conditions.append("t.date <= ?")
            params.append(date_to)

        where = " AND ".join(conditions)

        cursor.execute(f"""
            SELECT d.id as doc_id, d.doc_type, d.currency,
                   d.net_amount, d.vat_amount,
                   d.net_amount_sek, d.vat_amount_sek,
                   d.vat_breakdown_json, d.amount as gross_amount,
                   d.amount_sek as gross_amount_sek,
                   MIN(m.matched_at) as first_matched_at
            FROM documents d
            JOIN matches m ON m.document_id = d.id
            JOIN transactions t ON m.transaction_id = t.id
            JOIN accounts a ON t.account_id = a.id
            WHERE {where}
            GROUP BY d.id
        """, params)

        rows = cursor.fetchall()

    # Aggregate by VAT rate
    by_rate = defaultdict(lambda: {'net_sek': 0.0, 'vat_sek': 0.0, 'count': 0})
    totals = {'net_sek': 0.0, 'vat_sek': 0.0, 'gross_sek': 0.0}
    incoming_vat_sek = 0.0  # Ingående moms (purchases)
    outgoing_vat_sek = 0.0  # Utgående moms (sales)

    for row in rows:
        doc_type = row['doc_type']
        vat_sek = row['vat_amount_sek']
        net_sek = row['net_amount_sek']
        gross_sek = row['gross_amount_sek'] or row['gross_amount']

        if vat_sek is None and net_sek is None:
            continue

        vat_sek = vat_sek or 0.0
        net_sek = net_sek or 0.0
        gross_sek = gross_sek or 0.0

        totals['net_sek'] += net_sek
        totals['vat_sek'] += vat_sek
        totals['gross_sek'] += gross_sek

        # Distinguish incoming vs outgoing VAT
        is_outgoing = doc_type == 'outgoing_invoice'
        if is_outgoing:
            outgoing_vat_sek += vat_sek
        else:
            incoming_vat_sek += vat_sek

        # Parse breakdown for per-rate aggregation
        breakdown_json = row['vat_breakdown_json']
        if breakdown_json:
            try:
                breakdown = json.loads(breakdown_json)
                for entry in breakdown:
                    rate = entry.get('rate', 0)
                    entry_net = entry.get('net', 0)
                    entry_vat = entry.get('vat', 0)

                    # Convert to SEK if needed
                    if row['currency'] and row['currency'] != 'SEK' and row['gross_amount'] and row['gross_amount'] != 0:
                        fx_rate = (row['gross_amount_sek'] or 0) / row['gross_amount']
                        entry_net = round(entry_net * fx_rate, 2)
                        entry_vat = round(entry_vat * fx_rate, 2)

                    by_rate[rate]['net_sek'] += entry_net
                    by_rate[rate]['vat_sek'] += entry_vat
                    by_rate[rate]['count'] += 1
            except (json.JSONDecodeError, TypeError):
                # Fall back to total-level data with unknown rate
                by_rate[0]['net_sek'] += net_sek
                by_rate[0]['vat_sek'] += vat_sek
                by_rate[0]['count'] += 1
        elif vat_sek != 0:
            # No breakdown available, lump under rate 0 (unknown)
            by_rate[0]['net_sek'] += net_sek
            by_rate[0]['vat_sek'] += vat_sek
            by_rate[0]['count'] += 1

    # Build response
    by_rate_list = [
        {
            'rate': rate,
            'net_sek': round(vals['net_sek'], 2),
            'vat_sek': round(vals['vat_sek'], 2),
            'count': vals['count'],
        }
        for rate, vals in sorted(by_rate.items())
    ]

    return jsonify({
        'period': {'from': date_from, 'to': date_to},
        'by_rate': by_rate_list,
        'totals': {
            'net_sek': round(totals['net_sek'], 2),
            'vat_sek': round(totals['vat_sek'], 2),
            'gross_sek': round(totals['gross_sek'], 2),
        },
        'incoming_vat_sek': round(incoming_vat_sek, 2),
        'outgoing_vat_sek': round(outgoing_vat_sek, 2),
    })


@api_companies_bp.route('/api/report')
def api_report():
    """Get report data for accounting."""
    company_id = request.args.get('company_id')
    date_from = request.args.get('from')
    date_to = request.args.get('to')

    with get_db() as conn:
        cursor = conn.cursor()

        # Build WHERE clause
        conditions = ["t.is_internal_transfer = 0"]
        params = []

        if company_id:
            conditions.append("a.company_id = ?")
            params.append(company_id)
        if date_from:
            conditions.append("t.date >= ?")
            params.append(date_from)
        if date_to:
            conditions.append("t.date <= ?")
            params.append(date_to)

        where = " AND ".join(conditions)

        # Total expenses and income
        cursor.execute(f"""
            SELECT
                SUM(CASE WHEN t.amount < 0 THEN t.amount ELSE 0 END) as expenses,
                SUM(CASE WHEN t.amount > 0 THEN t.amount ELSE 0 END) as income
            FROM transactions t
            JOIN accounts a ON t.account_id = a.id
            WHERE {where}
        """, params)
        row = cursor.fetchone()
        total_expenses = row['expenses'] or 0
        total_income = row['income'] or 0

        # By accounting code
        cursor.execute(f"""
            SELECT
                t.accounting_code as code,
                ba.name as name,
                COUNT(*) as count,
                SUM(t.amount) as total
            FROM transactions t
            JOIN accounts a ON t.account_id = a.id
            LEFT JOIN bas_accounts ba ON t.accounting_code = ba.code
            WHERE {where} AND t.amount < 0
            GROUP BY t.accounting_code
            ORDER BY t.accounting_code
        """, params)
        by_account = [dict(row) for row in cursor.fetchall()]

        # Missing receipts
        cursor.execute(f"""
            SELECT t.date, t.reference, t.amount, a.name as account
            FROM transactions t
            JOIN accounts a ON t.account_id = a.id
            WHERE {where}
            AND t.amount < 0
            AND (t.needs_receipt = 1 OR t.needs_receipt IS NULL)
            AND NOT EXISTS (SELECT 1 FROM matches m WHERE m.transaction_id = t.id)
            ORDER BY t.date DESC
        """, params)
        missing = [dict(row) for row in cursor.fetchall()]

        # By month (period report)
        cursor.execute(f"""
            SELECT
                strftime('%Y-%m', t.date) as period,
                SUM(CASE WHEN t.amount < 0 THEN t.amount ELSE 0 END) as expenses,
                SUM(CASE WHEN t.amount > 0 THEN t.amount ELSE 0 END) as income
            FROM transactions t
            JOIN accounts a ON t.account_id = a.id
            WHERE {where}
            GROUP BY period
            ORDER BY period
        """, params)
        by_period = [dict(row) for row in cursor.fetchall()]

        # By party (leverantörsreskontra) — match using parties table patterns
        cursor.execute("SELECT name, patterns FROM parties WHERE patterns IS NOT NULL AND patterns != '' AND patterns != '[]'")
        party_patterns = [(r['name'], parse_patterns(r['patterns'])) for r in cursor.fetchall()]

        cursor.execute(f"""
            SELECT t.reference, t.amount
            FROM transactions t
            JOIN accounts a ON t.account_id = a.id
            WHERE {where} AND t.amount < 0
        """, params)

        party_totals = {}
        for row in cursor.fetchall():
            ref = (row['reference'] or '').upper()
            party = 'Övriga'
            for party_name, patterns in party_patterns:
                if any(p.upper() in ref for p in patterns):
                    party = party_name
                    break
            entry = party_totals.setdefault(party, {'party': party, 'count': 0, 'total': 0})
            entry['count'] += 1
            entry['total'] += row['amount']

        by_party = sorted(party_totals.values(), key=lambda v: v['total'])

    return jsonify({
        'total_expenses': total_expenses,
        'total_income': total_income,
        'by_account': by_account,
        'by_period': by_period,
        'by_party': by_party,
        'missing': missing,
        'missing_count': len(missing)
    })
