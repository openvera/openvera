"""Document API routes."""

from flask import Blueprint, jsonify, request, current_app, send_file, abort
from werkzeug.utils import secure_filename
from pathlib import Path
from datetime import datetime
import json
import hashlib
import os
from config import FILES_DIR
from db import get_db, get_or_create_file, insert_document, get_documents, resolve_filepath

api_documents_bp = Blueprint('api_documents', __name__)


@api_documents_bp.route('/api/documents')
def api_list_documents():
    """List documents with optional filters."""
    company_id = request.args.get('company_id', type=int)
    doc_type = request.args.get('doc_type')
    unmatched_only = request.args.get('unmatched_only') == '1'

    documents = get_documents(company_id=company_id, doc_type=doc_type, unmatched_only=unmatched_only)
    return jsonify(documents)


@api_documents_bp.route('/api/document_details')
def api_document_details():
    """Get document metadata for display in modal."""
    filepath = request.args.get('path', '')
    doc_id = request.args.get('id', '')
    if not filepath and not doc_id:
        return jsonify({'error': 'Missing path or id'}), 400

    with get_db() as conn:
        cursor = conn.cursor()
        if doc_id:
            cursor.execute("""
                SELECT d.*, f.filepath, f.filename, f.content_hash,
                       c.name as company_name, c.slug as company_slug,
                       p.name as person_name, pa.name as party_name, pa.id as party_id_ref
                FROM documents d
                JOIN companies c ON d.company_id = c.id
                LEFT JOIN files f ON d.file_id = f.id
                LEFT JOIN persons p ON d.person_id = p.id
                LEFT JOIN parties pa ON d.party_id = pa.id
                WHERE d.id = ?
            """, (doc_id,))
        else:
            cursor.execute("""
                SELECT d.*, f.filepath, f.filename, f.content_hash,
                       c.name as company_name, c.slug as company_slug,
                       p.name as person_name, pa.name as party_name, pa.id as party_id_ref
                FROM documents d
                JOIN companies c ON d.company_id = c.id
                LEFT JOIN files f ON d.file_id = f.id
                LEFT JOIN persons p ON d.person_id = p.id
                LEFT JOIN parties pa ON d.party_id = pa.id
                WHERE f.filepath = ? OR f.filepath LIKE ?
            """, (filepath, f'%{Path(filepath).name}'))
        row = cursor.fetchone()
        if not row:
            return jsonify({'error': 'Document not found'}), 404

        # Get company-linked parties for dropdown
        cursor.execute("""
            SELECT p.id, p.name
            FROM parties p
            JOIN party_relations pr ON p.id = pr.party_id
            WHERE pr.company_id = ?
            ORDER BY p.name
        """, (row['company_id'],))
        parties = [{'id': r['id'], 'name': r['name']} for r in cursor.fetchall()]

        # Get related documents (invoices from same company for linking)
        related_documents = []
        if row['company_id']:
            cursor.execute("""
                SELECT d.id, d.amount, d.doc_date, pa.name as party_name
                FROM documents d
                LEFT JOIN parties pa ON d.party_id = pa.id
                WHERE d.company_id = ?
                  AND d.doc_type IN ('invoice', 'outgoing_invoice')
                  AND d.id != ?
                ORDER BY d.doc_date DESC
                LIMIT 50
            """, (row['company_id'], row['id']))
            related_documents = [{'id': r['id'], 'party_name': r['party_name'], 'amount': r['amount'], 'doc_date': r['doc_date']}
                                for r in cursor.fetchall()]

        # Parse extracted_json if present
        extracted_json = None
        if row['extracted_json']:
            try:
                extracted_json = json.loads(row['extracted_json'])
            except:
                pass

        # Check if document is matched and get transaction details
        cursor.execute("""
            SELECT m.id as match_id, m.confidence, m.match_type,
                   t.id as txn_id, t.date as txn_date, t.amount as txn_amount,
                   t.reference as txn_reference, a.name as account_name
            FROM matches m
            JOIN transactions t ON m.transaction_id = t.id
            JOIN accounts a ON t.account_id = a.id
            WHERE m.document_id = ?
        """, (row['id'],))
        match_rows = cursor.fetchall()
        is_matched = len(match_rows) > 0
        matched_transactions = []
        for match_row in match_rows:
            matched_transactions.append({
                'match_id': match_row['match_id'],
                'txn_id': match_row['txn_id'],
                'date': match_row['txn_date'],
                'amount': match_row['txn_amount'],
                'reference': match_row['txn_reference'],
                'account': match_row['account_name'],
                'confidence': match_row['confidence'],
                'match_type': match_row['match_type']
            })

        # Parse VAT breakdown if present
        vat_breakdown = None
        try:
            raw_breakdown = row['vat_breakdown_json']
            if raw_breakdown:
                vat_breakdown = json.loads(raw_breakdown)
        except (KeyError, json.JSONDecodeError):
            pass

        # Safely read VAT columns (may not exist in older databases)
        def _col(name, default=None):
            try:
                return row[name]
            except (IndexError, KeyError):
                return default

        return jsonify({
            'id': row['id'], 'amount': row['amount'],
            'currency': row['currency'], 'amount_sek': row['amount_sek'],
            'net_amount': _col('net_amount'),
            'vat_amount': _col('vat_amount'),
            'net_amount_sek': _col('net_amount_sek'),
            'vat_amount_sek': _col('vat_amount_sek'),
            'vat_breakdown': vat_breakdown,
            'doc_date': row['doc_date'], 'due_date': row['due_date'],
            'invoice_number': row['invoice_number'], 'ocr_number': row['ocr_number'],
            'company_id': row['company_id'],
            'company': row['company_name'], 'company_slug': row['company_slug'],
            'person': row['person_name'], 'party_id': row['party_id'],
            'party_name': row['party_name'], 'notes': row['notes'],
            'file_id': row['file_id'],
            'filepath': row['filepath'], 'filename': row['filename'],
            'doc_type': row['doc_type'], 'extracted_json': extracted_json,
            'reviewed_at': row['reviewed_at'],
            'match_attempted_at': row['match_attempted_at'],
            'match_feedback': row['match_feedback'],
            'is_matched': is_matched,
            'matched_transactions': matched_transactions,
            'related_document_id': row['related_document_id'],
            'related_documents': related_documents,
            'parties': parties
        })


@api_documents_bp.route('/api/files/<int:file_id>/view')
def api_view_file(file_id):
    """Serve a file for viewing."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT filepath FROM files WHERE id = ?", (file_id,))
        row = cursor.fetchone()
        if not row or not row['filepath']:
            abort(404)

    full_path = resolve_filepath(row['filepath']).resolve()
    if not str(full_path).startswith(str(FILES_DIR.resolve())):
        abort(403)
    if not full_path.exists():
        abort(404)

    return send_file(full_path)


@api_documents_bp.route('/api/documents/upload', methods=['POST'])
def api_upload_document():
    """Upload a new document (PDF/image) via API."""
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400

    file = request.files['file']
    if not file.filename:
        return jsonify({'error': 'Empty filename'}), 400

    company_id = request.form.get('company_id')
    company_slug = None

    if company_id:
        try:
            company_id = int(company_id)
        except ValueError:
            return jsonify({'error': 'company_id must be an integer'}), 400

        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT slug FROM companies WHERE id = ?", (company_id,))
            row = cursor.fetchone()
            if not row:
                return jsonify({'error': f'Company {company_id} not found'}), 404
            company_slug = row['slug']

    file_content = file.read()
    content_hash = hashlib.md5(file_content).hexdigest()

    # Check for duplicate by hash
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, filepath FROM files WHERE content_hash = ?", (content_hash,))
        existing = cursor.fetchone()
        if existing:
            cursor.execute("SELECT id FROM documents WHERE file_id = ?", (existing['id'],))
            doc = cursor.fetchone()
            return jsonify({
                'success': True,
                'duplicate': True,
                'file_id': existing['id'],
                'doc_id': doc['id'] if doc else None,
                'message': 'File already exists'
            })

    # Determine save path: {company}/{year}/ or inbox/
    if company_slug:
        year = str(datetime.now().year)
        save_dir = FILES_DIR / company_slug / year
    else:
        save_dir = FILES_DIR / 'inbox'
    save_dir.mkdir(parents=True, exist_ok=True)

    safe_filename = secure_filename(file.filename)
    if not safe_filename:
        safe_filename = f"document_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"

    filepath = save_dir / safe_filename
    counter = 1
    while filepath.exists():
        stem = Path(safe_filename).stem
        suffix = Path(safe_filename).suffix
        filepath = save_dir / f"{stem}_{counter}{suffix}"
        counter += 1

    with open(filepath, 'wb') as f:
        f.write(file_content)

    file_id = get_or_create_file(str(filepath), content_hash)

    return jsonify({
        'success': True,
        'file_id': file_id,
        'filepath': str(filepath),
        'message': 'File uploaded. Document will be created after AI processing.'
    }), 201


@api_documents_bp.route('/api/files/pending')
def api_pending_files():
    """Get files that haven't been processed into documents yet."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT f.id, f.filepath, f.filename, f.created_at, f.mime_type, f.file_size
            FROM files f
            LEFT JOIN documents d ON d.file_id = f.id
            WHERE d.id IS NULL
            ORDER BY f.created_at DESC
        """)
        files = []
        for row in cursor.fetchall():
            files.append({
                'id': row['id'],
                'filepath': row['filepath'],
                'filename': row['filename'],
                'created_at': row['created_at'],
                'mime_type': row['mime_type'],
                'file_size': row['file_size']
            })
        return jsonify({'files': files, 'count': len(files)})


@api_documents_bp.route('/api/files/<int:file_id>/process', methods=['POST'])
def api_process_file(file_id):
    """Create a Document from a pending File after AI processing."""
    data = request.get_json() or {}

    with get_db() as conn:
        cursor = conn.cursor()

        cursor.execute("SELECT id FROM files WHERE id = ?", (file_id,))
        file_row = cursor.fetchone()

        if not file_row:
            return jsonify({'error': 'File not found'}), 404

        doc_id = insert_document(
            file_id=file_id,
            company_id=data.get('company_id'),
            amount=data.get('amount'),
            currency=data.get('currency'),
            amount_sek=data.get('amount_sek'),
            net_amount=data.get('net_amount'),
            vat_amount=data.get('vat_amount'),
            net_amount_sek=data.get('net_amount_sek'),
            vat_amount_sek=data.get('vat_amount_sek'),
            vat_breakdown_json=data.get('vat_breakdown_json'),
            doc_date=data.get('doc_date'),
            doc_type=data.get('doc_type', 'invoice'),
            extracted_json=data.get('extracted_json'),
            party_id=data.get('party_id'),
        )

        cursor.execute("UPDATE files SET processed_at = CURRENT_TIMESTAMP WHERE id = ?", (file_id,))
        conn.commit()

        return jsonify({
            'success': True,
            'doc_id': doc_id,
            'file_id': file_id
        }), 201


@api_documents_bp.route('/api/documents/batch-update', methods=['PUT'])
def api_batch_update_documents():
    """Batch update fields for multiple documents."""
    data = request.get_json()
    ids = data.get('ids', [])
    if not ids:
        return jsonify({'error': 'No ids provided'}), 400

    updates = []
    params = []
    for field in ('doc_type', 'party_id'):
        if field in data:
            updates.append(f'{field} = ?')
            params.append(data[field])

    if 'reviewed' in data:
        if data['reviewed']:
            updates.append('reviewed_at = CURRENT_TIMESTAMP')
        else:
            updates.append('reviewed_at = NULL')

    if 'archived' in data:
        updates.append('archived = ?')
        params.append(1 if data['archived'] else 0)

    if not updates:
        return jsonify({'error': 'No fields to update'}), 400

    placeholders = ','.join('?' for _ in ids)
    params.extend(ids)

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(f"""
            UPDATE documents
            SET {', '.join(updates)}
            WHERE id IN ({placeholders})
        """, params)
        conn.commit()
        updated = cursor.rowcount

    return jsonify({'ok': True, 'updated': updated})


@api_documents_bp.route('/api/document/<int:doc_id>/update', methods=['POST'])
def api_update_document(doc_id):
    """Update document metadata."""
    data = request.get_json()

    with get_db() as conn:
        cursor = conn.cursor()
        allowed_fields = ['amount', 'currency', 'doc_date', 'due_date',
                         'invoice_number', 'ocr_number', 'party_id', 'notes', 'doc_type',
                         'net_amount', 'vat_amount', 'net_amount_sek', 'vat_amount_sek',
                         'vat_breakdown_json',
                         'related_document_id', 'match_feedback', 'needs_review']
        updates = []
        values = []
        for field in allowed_fields:
            if field in data:
                updates.append(f"{field} = ?")
                values.append(data[field] if data[field] != '' else None)

        if 'match_feedback' in data and not data['match_feedback']:
            updates.append("match_attempted_at = NULL")
            cursor.execute("DELETE FROM matches WHERE document_id = ?", (doc_id,))

        if 'reviewed' in data:
            if data['reviewed']:
                cursor.execute("SELECT reviewed_at FROM documents WHERE id = ?", (doc_id,))
                row = cursor.fetchone()
                if row and not row['reviewed_at']:
                    updates.append("reviewed_at = CURRENT_TIMESTAMP")
            else:
                updates.append("reviewed_at = NULL")

        if not updates:
            return jsonify({'error': 'No fields to update'}), 400
        values.append(doc_id)
        cursor.execute(f"UPDATE documents SET {', '.join(updates)} WHERE id = ?", values)
        conn.commit()
        return jsonify({'success': True, 'updated': len(updates)})


@api_documents_bp.route('/api/document/<int:doc_id>/review', methods=['POST'])
def api_review_document(doc_id):
    """Mark document as reviewed (or unreview)."""
    data = request.get_json() or {}
    unreview = data.get('unreview', False)

    with get_db() as conn:
        cursor = conn.cursor()
        if unreview:
            cursor.execute("UPDATE documents SET reviewed_at = NULL WHERE id = ?", (doc_id,))
        else:
            cursor.execute("UPDATE documents SET reviewed_at = CURRENT_TIMESTAMP WHERE id = ?", (doc_id,))

        if cursor.rowcount == 0:
            return jsonify({'success': False, 'error': 'Document not found'}), 404

        conn.commit()
        return jsonify({'success': True, 'reviewed': not unreview})


@api_documents_bp.route('/api/document/<int:doc_id>/archive', methods=['POST'])
def api_archive_document(doc_id):
    """Archive a document (mark as non-invoice, doesn't need matching)."""
    data = request.json or {}
    doc_type = data.get('doc_type', 'archive')

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE documents
            SET doc_type = ?, needs_review = 0, archived = 1
            WHERE id = ?
        """, (doc_type, doc_id))
        conn.commit()

    return jsonify({'ok': True})


@api_documents_bp.route('/api/document/<int:doc_id>', methods=['DELETE'])
def api_delete_document(doc_id):
    """Delete a document (file and database entry)."""
    with get_db() as conn:
        cursor = conn.cursor()

        cursor.execute("""
            SELECT d.file_id, f.filepath
            FROM documents d
            LEFT JOIN files f ON d.file_id = f.id
            WHERE d.id = ?
        """, (doc_id,))
        row = cursor.fetchone()
        if not row:
            return jsonify({'error': 'Document not found'}), 404

        file_id = row['file_id']
        filepath = row['filepath']

        cursor.execute("UPDATE documents SET related_document_id = NULL WHERE related_document_id = ?", (doc_id,))
        cursor.execute("DELETE FROM matches WHERE document_id = ?", (doc_id,))
        cursor.execute("DELETE FROM documents WHERE id = ?", (doc_id,))

        if file_id:
            cursor.execute("SELECT COUNT(*) as cnt FROM documents WHERE file_id = ?", (file_id,))
            if cursor.fetchone()['cnt'] == 0:
                cursor.execute("DELETE FROM files WHERE id = ?", (file_id,))
                if filepath:
                    abs_path = str(resolve_filepath(filepath))
                    if os.path.exists(abs_path):
                        try:
                            os.remove(abs_path)
                        except:
                            pass

        conn.commit()

    return jsonify({'ok': True})


@api_documents_bp.route('/api/duplicates')
def api_get_duplicates():
    """Get duplicate documents: identical content within same company."""
    with get_db() as conn:
        cursor = conn.cursor()
        duplicates = []

        cursor.execute("""
            SELECT d1.id as id1, f1.filename as filename1, d1.doc_date as date1,
                   pa1.name as party1, f1.filepath as path1, c1.name as company1,
                   d2.id as id2, f2.filename as filename2, d2.doc_date as date2,
                   pa2.name as party2, f2.filepath as path2, c2.name as company2
            FROM documents d1
            JOIN documents d2 ON d1.file_id = d2.file_id AND d1.id < d2.id AND d1.company_id = d2.company_id
            JOIN files f1 ON d1.file_id = f1.id
            JOIN files f2 ON d2.file_id = f2.id
            JOIN companies c1 ON d1.company_id = c1.id
            JOIN companies c2 ON d2.company_id = c2.id
            LEFT JOIN parties pa1 ON d1.party_id = pa1.id
            LEFT JOIN parties pa2 ON d2.party_id = pa2.id
            ORDER BY d1.file_id, d1.id
        """)

        for row in cursor.fetchall():
            duplicates.append({
                'filename': row['filename1'],
                'dup_type': 'Identiskt innehåll',
                'first': {
                    'id': row['id1'],
                    'filename': row['filename1'],
                    'date': row['date1'],
                    'party_name': row['party1'],
                    'path': row['path1'],
                    'company': row['company1'],
                },
                'second': {
                    'id': row['id2'],
                    'filename': row['filename2'],
                    'date': row['date2'],
                    'party_name': row['party2'],
                    'path': row['path2'],
                    'company': row['company2'],
                }
            })

    return jsonify(duplicates)


@api_documents_bp.route('/api/inbox/scan', methods=['POST'])
def api_inbox_scan():
    """Scan inbox folders for new files and create File records.

    Walks FILES_DIR/inbox/ and FILES_DIR/{company}/inbox/ for files not yet
    tracked in the database.  Creates files records only — document creation
    and data extraction are handled separately by an AI agent.
    """
    stats = {'scanned': 0, 'new': 0, 'skipped': 0, 'duplicate': 0, 'unreadable': 0, 'errors': []}

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT slug FROM companies")
        company_slugs = [row['slug'] for row in cursor.fetchall()]

        cursor.execute("SELECT filepath, content_hash FROM files")
        known_paths = set()
        known_hashes = set()
        for row in cursor.fetchall():
            known_paths.add(row['filepath'])
            if row['content_hash']:
                known_hashes.add(row['content_hash'])

    # Collect inbox directories to scan
    inbox_dirs = []
    global_inbox = FILES_DIR / 'inbox'
    if global_inbox.is_dir():
        inbox_dirs.append(global_inbox)
    for slug in company_slugs:
        company_inbox = FILES_DIR / slug / 'inbox'
        if company_inbox.is_dir():
            inbox_dirs.append(company_inbox)

    for inbox_dir in inbox_dirs:
        for entry in sorted(inbox_dir.rglob('*')):
            if entry.is_dir() or entry.name.startswith('.'):
                continue
            stats['scanned'] += 1

            rel_path = str(entry.relative_to(FILES_DIR))
            if rel_path in known_paths:
                stats['skipped'] += 1
                continue

            # Check content hash before creating record
            try:
                h = hashlib.md5()
                with open(entry, 'rb') as fh:
                    for chunk in iter(lambda: fh.read(8192), b''):
                        h.update(chunk)
                content_hash = h.hexdigest()
            except OSError:
                stats['unreadable'] += 1
                continue

            if content_hash in known_hashes:
                stats['duplicate'] += 1
                continue

            try:
                file_id = get_or_create_file(str(entry), content_hash)
                known_paths.add(rel_path)
                known_hashes.add(content_hash)
                stats['new'] += 1
            except Exception as e:
                stats['errors'].append(f"{entry.name}: {str(e)}")

    return jsonify(stats)


@api_documents_bp.route('/api/files/tree')
def api_file_tree():
    """Return the file tree structure under FILES_DIR.

    Annotates each file with in_db status by checking against the files table.
    """
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT filepath, filename, content_hash FROM files")
        db_paths = set()
        db_hash_to_file = {}  # hash → first filepath (the "original")
        db_path_to_hash = {}
        for row in cursor.fetchall():
            db_paths.add(row['filepath'])
            if row['content_hash']:
                if row['content_hash'] not in db_hash_to_file:
                    db_hash_to_file[row['content_hash']] = row['filepath']
                db_path_to_hash[row['filepath']] = row['content_hash']

    def build_tree(base_dir):
        children = []
        try:
            entries = sorted(base_dir.iterdir(), key=lambda e: (not e.is_dir(), e.name.lower()))
        except PermissionError:
            return children

        # Skip sensitive / non-document files
        _skip_ext = {'.pem', '.key', '.env', '.db', '.db-journal', '.db-wal', '.db-shm'}
        _skip_names = {'openvera.db', 'inbox.json'}

        for entry in entries:
            if entry.name.startswith('.') or entry.name in _skip_names:
                continue
            if not entry.is_dir() and entry.suffix.lower() in _skip_ext:
                continue
            rel = str(entry.relative_to(FILES_DIR))
            if entry.is_dir():
                sub = build_tree(entry)
                file_count = _count_files(sub)
                children.append({
                    'name': entry.name,
                    'type': 'dir',
                    'path': rel,
                    'file_count': file_count,
                    'children': sub,
                })
            else:
                in_db = rel in db_paths
                is_duplicate = False
                duplicate_of = None
                if in_db:
                    # DB-to-DB duplicate: same content_hash, different filepath
                    h = db_path_to_hash.get(rel)
                    if h and db_hash_to_file.get(h) != rel:
                        is_duplicate = True
                        duplicate_of = db_hash_to_file[h]
                else:
                    # Disk-only duplicate: content matches a DB file
                    try:
                        import hashlib
                        md5 = hashlib.md5()
                        with open(entry, 'rb') as fh:
                            for chunk in iter(lambda: fh.read(8192), b''):
                                md5.update(chunk)
                        file_hash = md5.hexdigest()
                        if file_hash in db_hash_to_file:
                            is_duplicate = True
                            duplicate_of = db_hash_to_file[file_hash]
                    except OSError:
                        pass
                node = {
                    'name': entry.name,
                    'type': 'file',
                    'path': rel,
                    'size': entry.stat().st_size,
                    'in_db': in_db,
                    'is_duplicate': is_duplicate,
                }
                if duplicate_of:
                    node['duplicate_of'] = duplicate_of
                children.append(node)
        return children

    tree = build_tree(FILES_DIR)
    return jsonify({'tree': tree})


def _count_files(nodes):
    """Recursively count files in a tree."""
    count = 0
    for n in nodes:
        if n['type'] == 'dir':
            count += _count_files(n['children'])
        else:
            count += 1
    return count


@api_documents_bp.route('/api/files/view-by-path')
def api_view_file_by_path():
    """Serve a file by its relative path under FILES_DIR."""
    rel_path = request.args.get('path', '')
    if not rel_path:
        abort(400)
    full_path = (FILES_DIR / rel_path).resolve()
    if not str(full_path).startswith(str(FILES_DIR.resolve())):
        abort(403)
    if not full_path.exists():
        abort(404)
    return send_file(full_path)


@api_documents_bp.route('/api/files/delete-by-path', methods=['POST'])
def api_delete_file_by_path():
    """Delete a file by its relative path under FILES_DIR."""
    data = request.get_json() or {}
    rel_path = data.get('path', '')
    if not rel_path:
        return jsonify({'error': 'Missing path'}), 400
    full_path = (FILES_DIR / rel_path).resolve()
    if not str(full_path).startswith(str(FILES_DIR.resolve())):
        return jsonify({'error': 'Forbidden'}), 403
    if not full_path.exists():
        return jsonify({'error': 'Not found'}), 404
    full_path.unlink()
    return jsonify({'ok': True, 'deleted': rel_path})


@api_documents_bp.route('/api/stats')
def api_stats():
    """Get overall statistics for the dashboard."""
    with get_db() as conn:
        cursor = conn.cursor()

        cursor.execute("SELECT COUNT(*) FROM documents")
        total_docs = cursor.fetchone()[0]

        cursor.execute("SELECT COUNT(DISTINCT document_id) FROM matches")
        matched_docs = cursor.fetchone()[0]

        cursor.execute("""
            SELECT COUNT(*) FROM transactions
            WHERE amount < 0 AND is_internal_transfer = 0
        """)
        total_expenses = cursor.fetchone()[0]

        cursor.execute("SELECT COUNT(DISTINCT transaction_id) FROM matches")
        matched_txns = cursor.fetchone()[0]

        cursor.execute("""
            SELECT COUNT(*) FROM documents
            WHERE party_id IS NULL
        """)
        no_party = cursor.fetchone()[0]

    return jsonify({
        'total_documents': total_docs,
        'matched_documents': matched_docs,
        'unmatched_documents': total_docs - matched_docs,
        'total_expense_transactions': total_expenses,
        'matched_transactions': matched_txns,
        'documents_without_party': no_party,
        'match_rate': round(matched_docs / total_docs * 100, 1) if total_docs > 0 else 0
    })
