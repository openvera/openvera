"""Transaction API routes."""

from flask import Blueprint, jsonify, request

from db import get_db, delete_match, mark_as_transfer, create_match, link_transfers

api_transactions_bp = Blueprint('api_transactions', __name__)


@api_transactions_bp.route('/api/transactions/search')
def api_search_transactions():
    """Search transactions for matching UI."""
    company_id = request.args.get('company_id', type=int)
    amount = request.args.get('amount', type=float)
    date = request.args.get('date')  # YYYY-MM-DD
    q = request.args.get('q', '').strip()
    unmatched_only = request.args.get('unmatched_only', '1') == '1'

    doc_type = request.args.get('doc_type', '')
    # Outgoing invoices match positive transactions (income), everything else matches negative (expenses)
    if doc_type == 'outgoing_invoice':
        conditions = ["t.amount > 0", "t.is_internal_transfer = 0"]
    else:
        conditions = ["t.amount < 0", "t.is_internal_transfer = 0"]
    params = []

    if company_id:
        conditions.append("a.company_id = ?")
        params.append(company_id)

    if unmatched_only:
        conditions.append("NOT EXISTS (SELECT 1 FROM matches m WHERE m.transaction_id = t.id)")

    if q:
        conditions.append("LOWER(t.reference) LIKE ?")
        params.append(f"%{q.lower()}%")

    if date:
        conditions.append("ABS(julianday(t.date) - julianday(?)) <= 200")
        params.append(date)

    if amount:
        conditions.append("(ABS(ABS(t.amount) - ?) < 1)")
        params.append(abs(amount))

    where_clause = "WHERE " + " AND ".join(conditions)

    # Order by date proximity if a date is given, otherwise by date DESC
    if date:
        order = "ABS(julianday(t.date) - julianday(?)) ASC, t.date DESC"
        params.append(date)
    else:
        order = "t.date DESC"

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(f"""
            SELECT t.id, t.date, t.reference, t.amount,
                   a.name as account_name
            FROM transactions t
            JOIN accounts a ON t.account_id = a.id
            {where_clause}
            ORDER BY {order}
            LIMIT 20
        """, params)
        results = [dict(row) for row in cursor.fetchall()]

    return jsonify(results)


@api_transactions_bp.route('/api/unmatch-invoice', methods=['POST'])
def api_unmatch_invoice():
    """Remove a match."""
    data = request.json
    transaction_id = data.get('transaction_id')
    document_id = data.get('document_id')

    if transaction_id and document_id:
        delete_match(transaction_id, document_id)

    return jsonify({'ok': True})


@api_transactions_bp.route('/api/mark-transfer', methods=['POST'])
def api_mark_transfer():
    """Mark a transaction as internal transfer."""
    data = request.json
    transaction_id = data.get('transaction_id')
    is_transfer = data.get('is_transfer', True)

    if not transaction_id:
        return jsonify({'error': 'Missing transaction_id'}), 400

    mark_as_transfer(transaction_id, is_transfer)
    return jsonify({'ok': True})


@api_transactions_bp.route('/api/transaction/<int:txn_id>')
def api_get_transaction(txn_id):
    """Get transaction details."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT t.*,
                   a.name as account_name, a.id as account_id,
                   c.name as company_name, c.id as company_id, c.slug as company_slug,
                   ba.name as accounting_code_name,
                   EXISTS(SELECT 1 FROM matches m WHERE m.transaction_id = t.id) as is_matched
            FROM transactions t
            JOIN accounts a ON t.account_id = a.id
            JOIN companies c ON a.company_id = c.id
            LEFT JOIN bas_accounts ba ON t.accounting_code = ba.code
            WHERE t.id = ?
        """, (txn_id,))
        row = cursor.fetchone()
        if not row:
            return jsonify({'error': 'Not found'}), 404

        return jsonify({
            'id': row['id'],
            'date': row['date'],
            'reference': row['reference'],
            'amount': row['amount'],
            'category': row['category'],
            'accounting_code': row['accounting_code'],
            'accounting_code_name': row['accounting_code_name'],
            'notes': row['notes'],
            'is_internal_transfer': row['is_internal_transfer'],
            'needs_receipt': row['needs_receipt'],
            'linked_transfer_id': row['linked_transfer_id'],
            'account_id': row['account_id'],
            'account_name': row['account_name'],
            'company_id': row['company_id'],
            'company_name': row['company_name'],
            'company_slug': row['company_slug'],
            'is_matched': bool(row['is_matched']),
        })


@api_transactions_bp.route('/api/transaction/<int:txn_id>', methods=['PUT'])
def api_update_transaction(txn_id):
    """Update transaction details."""
    data = request.json

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE transactions
            SET category = COALESCE(?, category),
                accounting_code = ?,
                notes = ?,
                is_internal_transfer = COALESCE(?, is_internal_transfer),
                needs_receipt = COALESCE(?, needs_receipt)
            WHERE id = ?
        """, (
            data.get('category'),
            data.get('accounting_code'),
            data.get('notes'),
            data.get('is_internal_transfer'),
            data.get('needs_receipt'),
            txn_id
        ))
        conn.commit()

    return jsonify({'ok': True})


@api_transactions_bp.route('/api/transactions/batch-update', methods=['PUT'])
def api_batch_update_transactions():
    """Batch update accounting_code and/or category for multiple transactions."""
    data = request.json
    ids = data.get('ids', [])
    if not ids:
        return jsonify({'error': 'No ids provided'}), 400

    updates = []
    params = []
    for field in ('accounting_code', 'category', 'is_internal_transfer', 'needs_receipt'):
        if field in data:
            updates.append(f'{field} = ?')
            params.append(data[field])

    if not updates:
        return jsonify({'error': 'No fields to update'}), 400

    placeholders = ','.join('?' for _ in ids)
    params.extend(ids)

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(f"""
            UPDATE transactions
            SET {', '.join(updates)}
            WHERE id IN ({placeholders})
        """, params)
        conn.commit()
        updated = cursor.rowcount

    return jsonify({'ok': True, 'updated': updated})


@api_transactions_bp.route('/api/transaction/<int:txn_id>/matches')
def api_transaction_matches(txn_id):
    """Get documents matched to a transaction."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT d.id, d.amount, d.currency, d.doc_date, d.doc_type,
                   d.reviewed_at, d.net_amount, d.vat_amount,
                   pa.name as party_name, pa.id as party_id,
                   f.filename, m.match_type, m.confidence
            FROM documents d
            JOIN matches m ON m.document_id = d.id
            LEFT JOIN files f ON d.file_id = f.id
            LEFT JOIN parties pa ON d.party_id = pa.id
            WHERE m.transaction_id = ?
        """, (txn_id,))

        docs = []
        for row in cursor.fetchall():
            docs.append({
                'id': row['id'],
                'party_name': row['party_name'],
                'party_id': row['party_id'],
                'amount': row['amount'],
                'net_amount': row['net_amount'],
                'vat_amount': row['vat_amount'],
                'currency': row['currency'],
                'doc_date': row['doc_date'],
                'doc_type': row['doc_type'],
                'filename': row['filename'],
                'match_type': row['match_type'],
                'confidence': row['confidence'],
                'reviewed_at': row['reviewed_at'],
            })

    return jsonify({'matches': docs})


@api_transactions_bp.route('/api/matches', methods=['POST'])
def api_create_match():
    """Create a match between a transaction and a document."""
    data = request.json
    transaction_id = data.get('transaction_id')
    document_id = data.get('document_id')
    match_type = data.get('match_type', 'manual')
    matched_by = data.get('matched_by', 'user')
    confidence = data.get('confidence')

    if not transaction_id or not document_id:
        return jsonify({'error': 'transaction_id och document_id krävs'}), 400

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM transactions WHERE id = ?", (transaction_id,))
        if not cursor.fetchone():
            return jsonify({'error': 'Transaktion hittades inte'}), 404
        cursor.execute("SELECT id FROM documents WHERE id = ?", (document_id,))
        if not cursor.fetchone():
            return jsonify({'error': 'Dokument hittades inte'}), 404

    match_id = create_match(transaction_id, document_id, match_type, matched_by, confidence)
    return jsonify({'ok': True, 'match_id': match_id})


@api_transactions_bp.route('/api/matches')
def api_list_matches():
    """List matches with optional filters."""
    transaction_id = request.args.get('transaction_id', type=int)
    document_id = request.args.get('document_id', type=int)
    company_slug = request.args.get('company_slug')

    with get_db() as conn:
        cursor = conn.cursor()

        conditions = []
        params = []

        if transaction_id:
            conditions.append("m.transaction_id = ?")
            params.append(transaction_id)
        if document_id:
            conditions.append("m.document_id = ?")
            params.append(document_id)
        if company_slug:
            conditions.append("c.slug = ?")
            params.append(company_slug)

        where_clause = "WHERE " + " AND ".join(conditions) if conditions else ""

        cursor.execute(f"""
            SELECT m.id, m.transaction_id, m.document_id, m.match_type,
                   m.confidence, m.matched_by, m.matched_at,
                   t.date as transaction_date, t.reference, t.amount,
                   d.doc_type, d.doc_date, d.amount as doc_amount,
                   d.net_amount as doc_net_amount, d.vat_amount as doc_vat_amount,
                   d.currency as doc_currency,
                   pa.name as party_name,
                   c.slug as company_slug, c.name as company_name
            FROM matches m
            JOIN transactions t ON m.transaction_id = t.id
            JOIN documents d ON m.document_id = d.id
            LEFT JOIN parties pa ON d.party_id = pa.id
            JOIN accounts a ON t.account_id = a.id
            JOIN companies c ON a.company_id = c.id
            {where_clause}
            ORDER BY m.matched_at DESC
        """, params)
        matches = [dict(row) for row in cursor.fetchall()]

    return jsonify(matches)


@api_transactions_bp.route('/api/transaction/<int:txn_id>', methods=['DELETE'])
def api_delete_transaction(txn_id):
    """Delete a transaction and related matches/transfers."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM transactions WHERE id = ?", (txn_id,))
        if not cursor.fetchone():
            return jsonify({'error': 'Not found'}), 404

        # Delete matches
        cursor.execute("DELETE FROM matches WHERE transaction_id = ?", (txn_id,))

        # Delete transfers (both sides)
        cursor.execute("DELETE FROM transfers WHERE from_transaction_id = ? OR to_transaction_id = ?",
                       (txn_id, txn_id))

        # Clear linked_transfer_id references pointing to this transaction
        cursor.execute("UPDATE transactions SET linked_transfer_id = NULL WHERE linked_transfer_id = ?", (txn_id,))

        # Delete the transaction
        cursor.execute("DELETE FROM transactions WHERE id = ?", (txn_id,))
        conn.commit()

    return jsonify({'ok': True})


@api_transactions_bp.route('/api/transfers')
def api_list_transfers():
    """List transfers with optional company filter."""
    company_slug = request.args.get('company_slug')

    with get_db() as conn:
        cursor = conn.cursor()

        conditions = []
        params = []

        if company_slug:
            conditions.append("c.slug = ?")
            params.append(company_slug)

        where_clause = "WHERE " + " AND ".join(conditions) if conditions else ""

        cursor.execute(f"""
            SELECT tr.id, tr.from_transaction_id, tr.to_transaction_id,
                   tr.transfer_type, tr.notes, tr.created_at,
                   ft.date as from_date, ft.amount as from_amount, ft.reference as from_reference,
                   fa.name as from_account,
                   tt.date as to_date, tt.amount as to_amount, tt.reference as to_reference,
                   ta.name as to_account,
                   c.slug as company_slug, c.name as company_name
            FROM transfers tr
            JOIN transactions ft ON tr.from_transaction_id = ft.id
            JOIN transactions tt ON tr.to_transaction_id = tt.id
            JOIN accounts fa ON ft.account_id = fa.id
            JOIN accounts ta ON tt.account_id = ta.id
            JOIN companies c ON fa.company_id = c.id
            {where_clause}
            ORDER BY tr.created_at DESC
        """, params)
        transfers = [dict(row) for row in cursor.fetchall()]

    return jsonify(transfers)


@api_transactions_bp.route('/api/transfers', methods=['POST'])
def api_create_transfer():
    """Create a transfer link between two transactions."""
    data = request.json
    from_transaction_id = data.get('from_transaction_id')
    to_transaction_id = data.get('to_transaction_id')
    notes = data.get('notes')

    if not from_transaction_id or not to_transaction_id:
        return jsonify({'error': 'from_transaction_id och to_transaction_id krävs'}), 400

    with get_db() as conn:
        cursor = conn.cursor()

        # Validate both transactions exist and get their companies
        cursor.execute("""
            SELECT t.id, a.company_id
            FROM transactions t
            JOIN accounts a ON t.account_id = a.id
            WHERE t.id IN (?, ?)
        """, (from_transaction_id, to_transaction_id))
        rows = cursor.fetchall()

        if len(rows) < 2:
            return jsonify({'error': 'En eller båda transaktionerna hittades inte'}), 404

        companies = {row['id']: row['company_id'] for row in rows}
        if companies[from_transaction_id] != companies[to_transaction_id]:
            return jsonify({'error': 'Transaktionerna tillhör olika företag'}), 400

    transfer_id = link_transfers(from_transaction_id, to_transaction_id, notes)
    return jsonify({'ok': True, 'transfer_id': transfer_id})


@api_transactions_bp.route('/api/transfers/<int:transfer_id>', methods=['DELETE'])
def api_delete_transfer(transfer_id):
    """Delete a transfer link and unmark transactions if appropriate."""
    with get_db() as conn:
        cursor = conn.cursor()

        cursor.execute("SELECT from_transaction_id, to_transaction_id FROM transfers WHERE id = ?", (transfer_id,))
        row = cursor.fetchone()
        if not row:
            return jsonify({'error': 'Not found'}), 404

        from_id = row['from_transaction_id']
        to_id = row['to_transaction_id']

        # Delete the transfer link
        cursor.execute("DELETE FROM transfers WHERE id = ?", (transfer_id,))

        # Unmark transactions if they have no remaining transfer links
        for txn_id in (from_id, to_id):
            cursor.execute("""
                SELECT COUNT(*) as cnt FROM transfers
                WHERE from_transaction_id = ? OR to_transaction_id = ?
            """, (txn_id, txn_id))
            if cursor.fetchone()['cnt'] == 0:
                cursor.execute("""
                    UPDATE transactions SET is_internal_transfer = 0, category = 'expense'
                    WHERE id = ?
                """, (txn_id,))

        conn.commit()

    return jsonify({'ok': True})


@api_transactions_bp.route('/api/transactions/propagate-codes', methods=['POST'])
def api_propagate_codes():
    """Backfill accounting_code from matched documents and party patterns."""
    import json

    affected = []

    with get_db() as conn:
        cursor = conn.cursor()

        # Normalize empty strings to NULL
        cursor.execute("""
            UPDATE transactions SET accounting_code = NULL
            WHERE accounting_code = ''
        """)

        # 1. Via matches: document → party → default_code
        cursor.execute("""
            SELECT t.id, t.reference, t.date, p.default_code, p.name as party_name
            FROM transactions t
            JOIN matches m ON m.transaction_id = t.id
            JOIN documents d ON m.document_id = d.id
            JOIN parties p ON d.party_id = p.id
            WHERE t.accounting_code IS NULL
              AND p.default_code IS NOT NULL
        """)
        match_affected = [dict(row) for row in cursor.fetchall()]
        for row in match_affected:
            row['source'] = 'match'
        affected.extend(match_affected)

        if match_affected:
            cursor.execute("""
                UPDATE transactions
                SET accounting_code = p.default_code
                FROM matches m
                JOIN documents d ON m.document_id = d.id
                JOIN parties p ON d.party_id = p.id
                WHERE transactions.id = m.transaction_id
                  AND transactions.accounting_code IS NULL
                  AND p.default_code IS NOT NULL
            """)

        # 2. Via party patterns: reference LIKE pattern
        cursor.execute("""
            SELECT id, name, patterns, default_code
            FROM parties
            WHERE default_code IS NOT NULL
              AND patterns IS NOT NULL AND patterns != '[]' AND patterns != ''
        """)
        parties = cursor.fetchall()

        for party in parties:
            patterns = json.loads(party['patterns']) if party['patterns'] else []
            if not patterns:
                continue

            conditions = []
            params = []
            for pattern in patterns:
                conditions.append("t.reference LIKE ?")
                params.append(f'%{pattern}%')

            where = ' OR '.join(conditions)
            cursor.execute(f"""
                SELECT t.id, t.reference, t.date
                FROM transactions t
                WHERE t.accounting_code IS NULL AND ({where})
            """, params)

            rows = [dict(r) for r in cursor.fetchall()]
            if rows:
                txn_ids = [r['id'] for r in rows]
                placeholders = ','.join('?' * len(txn_ids))
                cursor.execute(f"""
                    UPDATE transactions
                    SET accounting_code = ?
                    WHERE id IN ({placeholders}) AND accounting_code IS NULL
                """, [party['default_code']] + txn_ids)

                for r in rows:
                    r['default_code'] = party['default_code']
                    r['party_name'] = party['name']
                    r['source'] = 'pattern'
                affected.extend(rows)

        conn.commit()

    return jsonify({'ok': True, 'updated': len(affected), 'transactions': affected})
