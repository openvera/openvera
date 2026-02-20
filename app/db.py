"""
Database helper functions for the bokföring app.
"""

import sqlite3
from pathlib import Path
from contextlib import contextmanager

from config import DB_PATH, FILES_DIR

import re

def generate_slug(name):
    """Generate URL-friendly slug from a name. Handles Swedish characters."""
    slug = name.lower().strip()
    slug = slug.replace('å', 'a').replace('ä', 'a').replace('ö', 'o')
    slug = re.sub(r'[^a-z0-9]+', '-', slug)
    slug = slug.strip('-')
    return slug

@contextmanager
def get_db():
    """Context manager for database connections."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()

def dict_from_row(row):
    """Convert sqlite3.Row to dict."""
    if row is None:
        return None
    return dict(row)

def ensure_party_slugs():
    """Backfill slug column for parties that don't have one."""
    with get_db() as conn:
        cursor = conn.cursor()
        # Add column if missing (migration)
        try:
            cursor.execute("ALTER TABLE parties ADD COLUMN slug TEXT")
            conn.commit()
        except Exception:
            pass  # Column already exists

        cursor.execute("SELECT id, name FROM parties WHERE slug IS NULL OR slug = ''")
        rows = cursor.fetchall()
        if not rows:
            return

        # Get existing slugs to ensure uniqueness
        cursor.execute("SELECT slug FROM parties WHERE slug IS NOT NULL AND slug != ''")
        existing = {r['slug'] for r in cursor.fetchall()}

        for row in rows:
            base_slug = generate_slug(row['name'])
            slug = base_slug
            counter = 2
            while slug in existing:
                slug = f"{base_slug}-{counter}"
                counter += 1
            existing.add(slug)
            cursor.execute("UPDATE parties SET slug = ? WHERE id = ?", (slug, row['id']))
        conn.commit()


def get_companies():
    """Get all companies."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM companies ORDER BY name")
        return [dict_from_row(row) for row in cursor.fetchall()]

def get_company(slug):
    """Get a company by slug."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM companies WHERE slug = ?", (slug,))
        return dict_from_row(cursor.fetchone())

def get_accounts(company_id):
    """Get all accounts for a company."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT a.*,
                   COUNT(t.id) as transaction_count,
                   SUM(CASE WHEN t.amount < 0 AND t.is_internal_transfer = 0 THEN t.amount ELSE 0 END) as total_expenses,
                   SUM(CASE WHEN t.amount > 0 THEN t.amount ELSE 0 END) as total_income,
                   SUM(CASE WHEN t.amount < 0 AND t.is_internal_transfer = 1 THEN t.amount ELSE 0 END) as total_transfers,
                   COUNT(CASE WHEN t.amount < 0 AND t.is_internal_transfer = 0 
                       AND (t.needs_receipt = 1 OR t.needs_receipt IS NULL)
                       AND NOT EXISTS (
                           SELECT 1 FROM matches m WHERE m.transaction_id = t.id
                       ) THEN 1 END) as missing_receipts
            FROM accounts a
            LEFT JOIN transactions t ON a.id = t.account_id
            WHERE a.company_id = ?
            GROUP BY a.id
            ORDER BY a.name
        """, (company_id,))
        return [dict_from_row(row) for row in cursor.fetchall()]

def get_account_transactions(account_id, include_transfers=True):
    """Get all transactions for an account."""
    with get_db() as conn:
        cursor = conn.cursor()
        
        if include_transfers:
            where_clause = ""
        else:
            where_clause = "AND t.is_internal_transfer = 0"
        
        cursor.execute(f"""
            SELECT t.*,
                   EXISTS(SELECT 1 FROM matches m WHERE m.transaction_id = t.id) as is_matched,
                   (SELECT m.confidence FROM matches m WHERE m.transaction_id = t.id ORDER BY m.confidence DESC LIMIT 1) as match_confidence,
                   (SELECT d.reviewed_at FROM matches m JOIN documents d ON m.document_id = d.id WHERE m.transaction_id = t.id LIMIT 1) as match_reviewed_at,
                   (SELECT f.filepath FROM matches m
                    JOIN documents d ON m.document_id = d.id
                    LEFT JOIN files f ON d.file_id = f.id
                    WHERE m.transaction_id = t.id LIMIT 1) as matched_filepath,
                   (SELECT p.name FROM matches m
                    JOIN documents d ON m.document_id = d.id
                    JOIN parties p ON d.party_id = p.id
                    WHERE m.transaction_id = t.id AND d.party_id IS NOT NULL LIMIT 1) as vendor,
                   (SELECT p.slug FROM matches m
                    JOIN documents d ON m.document_id = d.id
                    LEFT JOIN parties p ON d.party_id = p.id
                    WHERE m.transaction_id = t.id AND d.party_id IS NOT NULL LIMIT 1) as vendor_slug
            FROM transactions t
            WHERE t.account_id = ? {where_clause}
            ORDER BY t.date DESC
        """, (account_id,))
        return [dict_from_row(row) for row in cursor.fetchall()]

def get_transactions_by_company(company_id, include_transfers=True):
    """Get all transactions for a company."""
    with get_db() as conn:
        cursor = conn.cursor()
        
        if include_transfers:
            where_clause = ""
        else:
            where_clause = "AND t.is_internal_transfer = 0"
        
        cursor.execute(f"""
            SELECT t.*, a.name as account_name,
                   EXISTS(SELECT 1 FROM matches m WHERE m.transaction_id = t.id) as is_matched,
                   (SELECT m.confidence FROM matches m WHERE m.transaction_id = t.id ORDER BY m.confidence DESC LIMIT 1) as match_confidence,
                   (SELECT d.reviewed_at FROM matches m JOIN documents d ON m.document_id = d.id WHERE m.transaction_id = t.id LIMIT 1) as match_reviewed_at,
                   (SELECT f.filepath FROM matches m
                    JOIN documents d ON m.document_id = d.id
                    LEFT JOIN files f ON d.file_id = f.id
                    WHERE m.transaction_id = t.id LIMIT 1) as matched_filepath
            FROM transactions t
            JOIN accounts a ON t.account_id = a.id
            WHERE a.company_id = ? {where_clause}
            ORDER BY t.date DESC
        """, (company_id,))
        return [dict_from_row(row) for row in cursor.fetchall()]

def get_documents(company_id=None, doc_type=None, unmatched_only=False):
    """Get documents with optional filters."""
    with get_db() as conn:
        cursor = conn.cursor()
        
        conditions = []
        params = []
        
        if company_id:
            conditions.append("d.company_id = ?")
            params.append(company_id)
        
        if doc_type:
            conditions.append("d.doc_type = ?")
            params.append(doc_type)
        
        if unmatched_only:
            conditions.append("NOT EXISTS (SELECT 1 FROM matches m WHERE m.document_id = d.id)")
        
        where_clause = "WHERE " + " AND ".join(conditions) if conditions else ""
        
        cursor.execute(f"""
            SELECT d.*, f.filepath, f.filename, f.content_hash,
                   c.name as company_name, c.slug as company_slug,
                   EXISTS(SELECT 1 FROM matches m WHERE m.document_id = d.id) as is_matched,
                   COALESCE(d.archived, 0) as is_archived,
                   p.name as party_name, p.slug as party_slug, p.entity_type as party_type, p.default_code as party_default_code,
                   best_match.confidence as match_confidence,
                   best_match.matched_by as match_matched_by,
                   best_match.txn_amount as matched_txn_amount
            FROM documents d
            JOIN companies c ON d.company_id = c.id
            LEFT JOIN files f ON d.file_id = f.id
            LEFT JOIN parties p ON d.party_id = p.id
            LEFT JOIN (
                SELECT m.document_id,
                       m.confidence, m.matched_by,
                       t.amount as txn_amount
                FROM matches m
                JOIN transactions t ON m.transaction_id = t.id
                WHERE m.id = (
                    SELECT m2.id FROM matches m2
                    WHERE m2.document_id = m.document_id
                    ORDER BY m2.confidence DESC, m2.id DESC
                    LIMIT 1
                )
            ) best_match ON best_match.document_id = d.id
            {where_clause}
            ORDER BY d.created_at DESC
        """, params)
        return [dict_from_row(row) for row in cursor.fetchall()]

def get_document(doc_id):
    """Get a single document by ID."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT d.*, f.filepath, f.filename, f.content_hash,
                   c.name as company_name, c.slug as company_slug
            FROM documents d
            JOIN companies c ON d.company_id = c.id
            LEFT JOIN files f ON d.file_id = f.id
            WHERE d.id = ?
        """, (doc_id,))
        return dict_from_row(cursor.fetchone())

def create_match(transaction_id, document_id, match_type='manual', matched_by='user', confidence=None):
    """Create a match between a transaction and document."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT OR REPLACE INTO matches (transaction_id, document_id, match_type, matched_by, confidence)
            VALUES (?, ?, ?, ?, ?)
        """, (transaction_id, document_id, match_type, matched_by, confidence))

        # Propagate party default_code to transaction if not already set
        cursor.execute("""
            UPDATE transactions
            SET accounting_code = (
                SELECT p.default_code
                FROM documents d
                JOIN parties p ON d.party_id = p.id
                WHERE d.id = ? AND p.default_code IS NOT NULL
            )
            WHERE id = ? AND accounting_code IS NULL
        """, (document_id, transaction_id))

        conn.commit()
        return cursor.lastrowid

def delete_match(transaction_id, document_id):
    """Delete a match."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            DELETE FROM matches WHERE transaction_id = ? AND document_id = ?
        """, (transaction_id, document_id))
        conn.commit()

def mark_as_transfer(transaction_id, is_transfer=True):
    """Mark a transaction as internal transfer."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE transactions SET is_internal_transfer = ?, category = ?
            WHERE id = ?
        """, (is_transfer, 'transfer' if is_transfer else 'expense', transaction_id))
        conn.commit()

def link_transfers(from_transaction_id, to_transaction_id, notes=None):
    """Link two transactions as a transfer pair. Returns the transfer ID."""
    with get_db() as conn:
        cursor = conn.cursor()

        # Mark both as internal transfers
        cursor.execute("""
            UPDATE transactions SET is_internal_transfer = 1, category = 'transfer'
            WHERE id IN (?, ?)
        """, (from_transaction_id, to_transaction_id))

        # Create transfer link
        cursor.execute("""
            INSERT INTO transfers (from_transaction_id, to_transaction_id, notes)
            VALUES (?, ?, ?)
        """, (from_transaction_id, to_transaction_id, notes))

        transfer_id = cursor.lastrowid
        conn.commit()
        return transfer_id

def get_company_summary(company_id):
    """Get summary statistics for a company."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT 
                COUNT(DISTINCT a.id) as account_count,
                COUNT(t.id) as transaction_count,
                SUM(CASE WHEN t.amount < 0 AND t.is_internal_transfer = 0 THEN t.amount ELSE 0 END) as total_expenses,
                SUM(CASE WHEN t.amount > 0 AND t.is_internal_transfer = 0 THEN t.amount ELSE 0 END) as total_income,
                SUM(CASE WHEN t.is_internal_transfer = 1 THEN t.amount ELSE 0 END) as total_transfers,
                (SELECT COUNT(*) FROM documents d WHERE d.company_id = ?) as document_count,
                COUNT(CASE WHEN t.amount < 0 AND t.is_internal_transfer = 0 AND NOT EXISTS (
                    SELECT 1 FROM matches m WHERE m.transaction_id = t.id
                ) THEN 1 END) as missing_receipts
            FROM accounts a
            LEFT JOIN transactions t ON a.id = t.account_id
            WHERE a.company_id = ?
        """, (company_id, company_id))
        return dict_from_row(cursor.fetchone())

def search_transactions(query=None, amount=None, company_slug=None, unmatched_only=True):
    """Search for transactions."""
    with get_db() as conn:
        cursor = conn.cursor()
        
        conditions = ["t.amount < 0", "t.is_internal_transfer = 0"]
        params = []
        
        if unmatched_only:
            conditions.append("NOT EXISTS (SELECT 1 FROM matches m WHERE m.transaction_id = t.id)")
        
        if query:
            conditions.append("LOWER(t.reference) LIKE ?")
            params.append(f"%{query.lower()}%")
        
        if amount:
            conditions.append("(ABS(t.amount - ?) < 1 OR ABS(t.amount + ?) < 1)")
            params.extend([amount, amount])
        
        if company_slug:
            conditions.append("c.slug = ?")
            params.append(company_slug)
        
        where_clause = "WHERE " + " AND ".join(conditions)
        
        cursor.execute(f"""
            SELECT t.*, a.name as account_name, c.name as company_name, c.slug as company_slug
            FROM transactions t
            JOIN accounts a ON t.account_id = a.id
            JOIN companies c ON a.company_id = c.id
            {where_clause}
            ORDER BY t.date DESC
            LIMIT 50
        """, params)
        return [dict_from_row(row) for row in cursor.fetchall()]


def resolve_filepath(rel_or_abs: str) -> Path:
    """Resolve a stored filepath (relative or absolute) to an absolute path."""
    p = Path(rel_or_abs)
    if p.is_absolute():
        return p
    return FILES_DIR / p


def _to_relative(filepath: str) -> str:
    """Convert an absolute filepath to relative (to FILES_DIR) if possible."""
    p = Path(filepath)
    if p.is_absolute() and p.is_relative_to(FILES_DIR):
        return str(p.relative_to(FILES_DIR))
    return filepath


def get_or_create_file(filepath: str, content_hash: str = None) -> int:
    """Get or create a file record, returning file_id. Stores path relative to FILES_DIR."""
    import hashlib

    filepath = str(filepath)
    filename = Path(filepath).name
    abs_path = resolve_filepath(filepath)
    rel_path = _to_relative(filepath)

    # Calculate hash if not provided
    if not content_hash and abs_path.exists():
        with open(abs_path, 'rb') as f:
            content_hash = hashlib.md5(f.read()).hexdigest()

    with get_db() as conn:
        cursor = conn.cursor()

        # Check if file exists by path (try both relative and absolute)
        cursor.execute("SELECT id FROM files WHERE filepath = ? OR filepath = ?",
                       (rel_path, filepath))
        row = cursor.fetchone()
        if row:
            return row['id']

        # Check by content hash (same file, different path)
        if content_hash:
            cursor.execute("SELECT id FROM files WHERE content_hash = ?", (content_hash,))
            row = cursor.fetchone()
            if row:
                return row['id']

        # Insert new file with relative path
        file_size = abs_path.stat().st_size if abs_path.exists() else None
        mime_type = _guess_mime(filename)
        cursor.execute("""
            INSERT INTO files (filepath, filename, content_hash, file_size, mime_type)
            VALUES (?, ?, ?, ?, ?)
        """, (rel_path, filename, content_hash, file_size, mime_type))
        conn.commit()
        return cursor.lastrowid


def _guess_mime(filename: str) -> str | None:
    ext = Path(filename).suffix.lower()
    return {
        '.pdf': 'application/pdf',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        '.csv': 'text/csv',
    }.get(ext)


def insert_document(file_id: int, company_id: int, **kwargs) -> int:
    """Insert a document linked to a file."""
    with get_db() as conn:
        cursor = conn.cursor()
        
        columns = ['file_id', 'company_id']
        values = [file_id, company_id]
        
        # Add optional fields
        optional_fields = [
            'doc_type', 'amount', 'currency', 'amount_sek',
            'net_amount', 'vat_amount', 'net_amount_sek', 'vat_amount_sek',
            'vat_breakdown_json',
            'doc_date', 'due_date', 'invoice_number', 'ocr_number',
            'party_id', 'extracted_json', 'notes'
        ]
        for field in optional_fields:
            if field in kwargs and kwargs[field] is not None:
                columns.append(field)
                values.append(kwargs[field])
        
        placeholders = ', '.join(['?' for _ in values])
        column_names = ', '.join(columns)
        
        cursor.execute(f"""
            INSERT INTO documents ({column_names})
            VALUES ({placeholders})
        """, values)
        conn.commit()
        return cursor.lastrowid
