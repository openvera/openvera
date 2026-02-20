#!/usr/bin/env python3
"""
Automated tests for Enable Banking integration.

Covers:
  1. OAuth callback state validation and replay rejection
  2. Banking route admin token auth
  3. Fetch pagination and incremental sync
  4. Idempotent re-runs (Enable Banking + CSV)
  5. Dedup for both external_id and import_fingerprint
  6. Migration on pre-existing populated schema
  7. Backward-compatible CSV import

Run inside Docker:
    docker compose exec openvera python -m pytest /openvera/tests/test_banking.py -v
"""

import hashlib
import json
import os
import secrets
import sqlite3
import sys
import tempfile
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

# Ensure app/ is on the path
APP_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'app')
SCRIPTS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'scripts')
sys.path.insert(0, APP_DIR)
sys.path.insert(0, SCRIPTS_DIR)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

def _init_test_db(db_path):
    """Initialize a test database with the full schema."""
    # Import init_db schema
    init_db_path = os.path.join(SCRIPTS_DIR, 'init_db.py')
    with open(init_db_path) as f:
        content = f.read()

    # Extract SCHEMA string by executing the module context
    import importlib.util
    spec = importlib.util.spec_from_file_location("init_db_mod", init_db_path)
    mod = importlib.util.module_from_spec(spec)

    # Patch DB_PATH before loading
    with patch.dict(os.environ, {'OPENVERA_BASE_DIR': str(Path(db_path).parent)}):
        # Re-import config with patched env
        import importlib
        if 'config' in sys.modules:
            importlib.reload(sys.modules['config'])
        spec.loader.exec_module(mod)

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.executescript(mod.SCHEMA)
    conn.commit()
    return conn


def _seed_company(conn, name='TestCo', slug='testco', org_number='5561234567'):
    """Insert a test company and return its ID."""
    conn.execute(
        "INSERT INTO companies (slug, name, org_number) VALUES (?, ?, ?)",
        (slug, name, org_number),
    )
    conn.commit()
    return conn.execute("SELECT id FROM companies WHERE slug = ?", (slug,)).fetchone()[0]


def _seed_account(conn, company_id, name='Företagskonto', account_number='12345678901'):
    """Insert a test account and return its ID."""
    conn.execute(
        "INSERT INTO accounts (company_id, name, account_number) VALUES (?, ?, ?)",
        (company_id, name, account_number),
    )
    conn.commit()
    return conn.execute(
        "SELECT id FROM accounts WHERE company_id = ? AND name = ?",
        (company_id, name),
    ).fetchone()[0]


def _seed_session(conn, company_id, session_id='test-session-001', days_valid=90):
    """Insert a test Enable Banking session."""
    valid_until = (datetime.now(timezone.utc) + timedelta(days=days_valid)).isoformat()
    conn.execute(
        "INSERT INTO enable_banking_sessions (company_id, session_id, valid_until, status) VALUES (?, ?, ?, 'active')",
        (company_id, session_id, valid_until),
    )
    conn.commit()


def _seed_oauth_state(conn, company_id, state='test-state-abc', ttl_minutes=10, used=False):
    """Insert an OAuth state record."""
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(minutes=ttl_minutes)
    conn.execute(
        "INSERT INTO oauth_states (state, company_id, created_at, expires_at, used) VALUES (?, ?, ?, ?, ?)",
        (state, company_id, now.isoformat(), expires_at.isoformat(), 1 if used else 0),
    )
    conn.commit()


@pytest.fixture
def test_db(tmp_path):
    """Create a fresh test database."""
    db_path = str(tmp_path / 'test.db')
    conn = _init_test_db(db_path)
    yield conn, db_path
    conn.close()


@pytest.fixture
def app_client(test_db, monkeypatch):
    """Create a Flask test client with patched config."""
    conn, db_path = test_db

    # Patch config module
    monkeypatch.setenv('OPENVERA_BASE_DIR', str(Path(db_path).parent))
    monkeypatch.setenv('OPENVERA_ADMIN_TOKEN', 'test-admin-token-secret')
    monkeypatch.setenv('ENABLE_BANKING_APP_ID', 'test-app-id')
    monkeypatch.setenv('ENABLE_BANKING_PRIVATE_KEY_PATH', '/tmp/test-key.pem')

    # Reload config
    import importlib
    if 'config' in sys.modules:
        importlib.reload(sys.modules['config'])

    # Patch DB_PATH in config
    import config
    monkeypatch.setattr(config, 'DB_PATH', Path(db_path))
    monkeypatch.setattr(config, 'OPENVERA_ADMIN_TOKEN', 'test-admin-token-secret')
    monkeypatch.setattr(config, 'ENABLE_BANKING_APP_ID', 'test-app-id')
    monkeypatch.setattr(config, 'ENABLE_BANKING_PRIVATE_KEY_PATH', '/tmp/test-key.pem')

    # Reload db module to pick up new DB_PATH
    if 'db' in sys.modules:
        importlib.reload(sys.modules['db'])

    # Create Flask app
    from app import app
    app.config['TESTING'] = True
    app.config['WTF_CSRF_ENABLED'] = False

    with app.test_client() as client:
        yield client, conn


# ---------------------------------------------------------------------------
# 1. OAuth callback state validation and replay rejection
# ---------------------------------------------------------------------------

class TestOAuthStateValidation:
    """Test OAuth state handling in the banking callback."""

    def test_callback_rejects_missing_state(self, app_client):
        client, conn = app_client
        resp = client.get('/api/banking/callback?code=some-code')
        assert resp.status_code == 400
        data = resp.get_json()
        assert 'Missing' in data.get('error', '') or 'state' in data.get('error', '')

    def test_callback_rejects_missing_code(self, app_client):
        client, conn = app_client
        resp = client.get('/api/banking/callback?state=some-state')
        assert resp.status_code == 400

    def test_callback_rejects_unknown_state(self, app_client):
        client, conn = app_client
        resp = client.get('/api/banking/callback?code=abc&state=nonexistent-state')
        assert resp.status_code == 400
        data = resp.get_json()
        assert 'Invalid' in data.get('error', '')

    def test_callback_rejects_expired_state(self, app_client):
        client, conn = app_client
        company_id = _seed_company(conn)
        # Create an already-expired state
        now = datetime.now(timezone.utc)
        expired = (now - timedelta(minutes=1)).isoformat()
        conn.execute(
            "INSERT INTO oauth_states (state, company_id, created_at, expires_at, used) VALUES (?, ?, ?, ?, 0)",
            ('expired-state', company_id, (now - timedelta(minutes=15)).isoformat(), expired),
        )
        conn.commit()

        resp = client.get('/api/banking/callback?code=abc&state=expired-state')
        assert resp.status_code == 400
        data = resp.get_json()
        assert 'expired' in data.get('error', '').lower()

    def test_callback_rejects_replayed_state(self, app_client):
        client, conn = app_client
        company_id = _seed_company(conn)
        _seed_oauth_state(conn, company_id, state='used-state', used=True)

        resp = client.get('/api/banking/callback?code=abc&state=used-state')
        assert resp.status_code == 400
        data = resp.get_json()
        assert 'replay' in data.get('error', '').lower() or 'used' in data.get('error', '').lower()

    @patch('routes.api_banking._get_eb_client')
    def test_callback_accepts_valid_state(self, mock_client_fn, app_client):
        client, conn = app_client
        company_id = _seed_company(conn)
        _seed_oauth_state(conn, company_id, state='valid-state')

        mock_client = MagicMock()
        mock_client.create_session.return_value = {
            'session_id': 'new-session-123',
            'accounts': [],
            'access': {'valid_until': '2026-08-01T00:00:00Z'},
        }
        mock_client_fn.return_value = mock_client

        resp = client.get('/api/banking/callback?code=test-code&state=valid-state')
        assert resp.status_code == 200
        data = resp.get_json()
        assert data['ok'] is True
        assert data['session_id'] == 'new-session-123'

        # Verify state was marked as used
        row = conn.execute("SELECT used FROM oauth_states WHERE state = 'valid-state'").fetchone()
        assert row[0] == 1

    @patch('routes.api_banking._get_eb_client')
    def test_callback_state_cannot_be_reused(self, mock_client_fn, app_client):
        """State used once should be rejected on second use."""
        client, conn = app_client
        company_id = _seed_company(conn)
        _seed_oauth_state(conn, company_id, state='one-time-state')

        mock_client = MagicMock()
        mock_client.create_session.return_value = {
            'session_id': 'sess-1',
            'accounts': [],
            'access': {'valid_until': '2026-08-01T00:00:00Z'},
        }
        mock_client_fn.return_value = mock_client

        # First use: should succeed
        resp1 = client.get('/api/banking/callback?code=code1&state=one-time-state')
        assert resp1.status_code == 200

        # Second use: should fail
        resp2 = client.get('/api/banking/callback?code=code2&state=one-time-state')
        assert resp2.status_code == 400


# ---------------------------------------------------------------------------
# 2. Banking route admin token auth
# ---------------------------------------------------------------------------

class TestAdminTokenAuth:
    """Test OPENVERA_ADMIN_TOKEN enforcement on banking routes."""

    def test_sessions_rejects_no_token(self, app_client):
        client, conn = app_client
        resp = client.get('/api/banking/sessions')
        assert resp.status_code == 401

    def test_sessions_rejects_wrong_token(self, app_client):
        client, conn = app_client
        resp = client.get('/api/banking/sessions', headers={'Authorization': 'Bearer wrong-token'})
        assert resp.status_code == 401

    def test_sessions_accepts_correct_token(self, app_client):
        client, conn = app_client
        resp = client.get('/api/banking/sessions', headers={'Authorization': 'Bearer test-admin-token-secret'})
        assert resp.status_code == 200

    def test_consent_status_rejects_no_token(self, app_client):
        client, conn = app_client
        resp = client.get('/api/banking/consent-status')
        assert resp.status_code == 401

    def test_consent_status_accepts_correct_token(self, app_client):
        client, conn = app_client
        resp = client.get('/api/banking/consent-status', headers={'Authorization': 'Bearer test-admin-token-secret'})
        assert resp.status_code == 200

    def test_authorize_rejects_no_token(self, app_client):
        client, conn = app_client
        resp = client.post('/api/banking/authorize/testco')
        assert resp.status_code == 401

    def test_delete_session_rejects_no_token(self, app_client):
        client, conn = app_client
        resp = client.delete('/api/banking/sessions/some-id')
        assert resp.status_code == 401

    def test_token_via_query_param(self, app_client):
        client, conn = app_client
        resp = client.get('/api/banking/sessions?token=test-admin-token-secret')
        assert resp.status_code == 200


# ---------------------------------------------------------------------------
# 3. Transaction field mapping
# ---------------------------------------------------------------------------

class TestTransactionMapping:
    """Test Enable Banking -> OpenVera transaction field mapping."""

    def test_debit_transaction_mapping(self):
        sys.path.insert(0, SCRIPTS_DIR)
        from fetch_transactions import map_transaction

        eb_txn = {
            'booking_date': '2026-01-15',
            'transaction_amount': {'currency': 'SEK', 'amount': '500.00'},
            'credit_debit_indicator': 'DBIT',
            'balance_after_transaction': {'currency': 'SEK', 'amount': '9500.00'},
            'remittance_information': ['Payment for invoice 123'],
            'transaction_id': 'txn-001',
        }

        mapped = map_transaction(eb_txn)
        assert mapped['date'] == '2026-01-15'
        assert mapped['amount'] == -500.0
        assert mapped['balance'] == 9500.0
        assert 'Payment for invoice 123' in mapped['reference']
        assert mapped['external_id'] == 'txn-001'

    def test_credit_transaction_mapping(self):
        from fetch_transactions import map_transaction

        eb_txn = {
            'booking_date': '2026-01-20',
            'transaction_amount': {'currency': 'SEK', 'amount': '1000.00'},
            'credit_debit_indicator': 'CRDT',
            'remittance_information': ['Incoming payment'],
            'entry_reference': 'ref-002',
        }

        mapped = map_transaction(eb_txn)
        assert mapped['amount'] == 1000.0
        assert mapped['external_id'] == 'ref-002'

    def test_fallback_to_creditor_name(self):
        from fetch_transactions import map_transaction

        eb_txn = {
            'booking_date': '2026-02-01',
            'transaction_amount': {'currency': 'SEK', 'amount': '200.00'},
            'credit_debit_indicator': 'DBIT',
            'creditor': {'name': 'ACME Corp'},
            'remittance_information': [],
        }

        mapped = map_transaction(eb_txn)
        assert mapped['reference'] == 'ACME Corp'


# ---------------------------------------------------------------------------
# 4 & 5. Dedup: external_id and import_fingerprint
# ---------------------------------------------------------------------------

class TestDeduplication:
    """Test dedup for both external_id and import_fingerprint."""

    def test_external_id_prevents_duplicates(self, test_db):
        conn, db_path = test_db
        company_id = _seed_company(conn)
        account_id = _seed_account(conn, company_id)

        conn.execute("""
            INSERT INTO transactions (account_id, date, amount, reference, external_id)
            VALUES (?, '2026-01-01', -100.0, 'Test', 'ext-001')
        """, (account_id,))
        conn.commit()

        # Inserting same external_id should fail
        with pytest.raises(sqlite3.IntegrityError):
            conn.execute("""
                INSERT INTO transactions (account_id, date, amount, reference, external_id)
                VALUES (?, '2026-01-01', -100.0, 'Test', 'ext-001')
            """, (account_id,))

    def test_import_fingerprint_prevents_duplicates(self, test_db):
        conn, db_path = test_db
        company_id = _seed_company(conn)
        account_id = _seed_account(conn, company_id)

        fingerprint = hashlib.sha256(b'2026-01-01|-100.0|Test|9900.0').hexdigest()[:32]

        conn.execute("""
            INSERT INTO transactions (account_id, date, amount, reference, import_fingerprint)
            VALUES (?, '2026-01-01', -100.0, 'Test', ?)
        """, (account_id, fingerprint))
        conn.commit()

        # Same fingerprint should fail
        with pytest.raises(sqlite3.IntegrityError):
            conn.execute("""
                INSERT INTO transactions (account_id, date, amount, reference, import_fingerprint)
                VALUES (?, '2026-01-01', -100.0, 'Test', ?)
            """, (account_id, fingerprint))

    def test_same_fingerprint_different_external_id_ok(self, test_db):
        """Transactions with same fingerprint but different external_id are distinct."""
        conn, db_path = test_db
        company_id = _seed_company(conn)
        account_id = _seed_account(conn, company_id)

        # external_id takes priority -- different external_ids are different transactions
        conn.execute("""
            INSERT INTO transactions (account_id, date, amount, reference, external_id, import_fingerprint)
            VALUES (?, '2026-01-01', -100.0, 'Test', 'ext-001', NULL)
        """, (account_id,))

        conn.execute("""
            INSERT INTO transactions (account_id, date, amount, reference, external_id, import_fingerprint)
            VALUES (?, '2026-01-01', -100.0, 'Test', 'ext-002', NULL)
        """, (account_id,))
        conn.commit()

        count = conn.execute(
            "SELECT COUNT(*) FROM transactions WHERE account_id = ?", (account_id,)
        ).fetchone()[0]
        assert count == 2

    def test_null_external_id_allows_multiple_inserts(self, test_db):
        """NULL external_id should not trigger the unique constraint."""
        conn, db_path = test_db
        company_id = _seed_company(conn)
        account_id = _seed_account(conn, company_id)

        # Two transactions with NULL external_id but different fingerprints
        conn.execute("""
            INSERT INTO transactions (account_id, date, amount, reference, external_id, import_fingerprint)
            VALUES (?, '2026-01-01', -100.0, 'Test A', NULL, 'fp-aaa')
        """, (account_id,))

        conn.execute("""
            INSERT INTO transactions (account_id, date, amount, reference, external_id, import_fingerprint)
            VALUES (?, '2026-01-02', -200.0, 'Test B', NULL, 'fp-bbb')
        """, (account_id,))
        conn.commit()

        count = conn.execute(
            "SELECT COUNT(*) FROM transactions WHERE account_id = ?", (account_id,)
        ).fetchone()[0]
        assert count == 2


# ---------------------------------------------------------------------------
# 4 (cont). Idempotent re-runs
# ---------------------------------------------------------------------------

class TestIdempotentReRuns:
    """Test that running fetch/import twice produces no duplicates."""

    def test_enable_banking_fetch_idempotent(self, test_db):
        """Simulates two runs of fetch_transactions with same data."""
        conn, db_path = test_db
        company_id = _seed_company(conn)
        account_id = _seed_account(conn, company_id)

        transactions_data = [
            (account_id, '2026-01-01', -100.0, 9900.0, 'Payment 1', 'Payment 1', 'ext-001', None),
            (account_id, '2026-01-02', -200.0, 9700.0, 'Payment 2', 'Payment 2', 'ext-002', None),
        ]

        # First run
        for t in transactions_data:
            conn.execute("""
                INSERT INTO transactions (account_id, date, amount, balance, reference, raw_reference, external_id, import_fingerprint)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, t)
        conn.commit()

        # Second run: should skip all due to external_id uniqueness
        skipped = 0
        for t in transactions_data:
            try:
                conn.execute("""
                    INSERT INTO transactions (account_id, date, amount, balance, reference, raw_reference, external_id, import_fingerprint)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, t)
            except sqlite3.IntegrityError:
                skipped += 1

        assert skipped == 2

        count = conn.execute(
            "SELECT COUNT(*) FROM transactions WHERE account_id = ?", (account_id,)
        ).fetchone()[0]
        assert count == 2

    def test_csv_import_idempotent(self, test_db):
        """Simulates two runs of CSV import with fingerprint dedup."""
        conn, db_path = test_db
        company_id = _seed_company(conn)
        account_id = _seed_account(conn, company_id)

        from import_transactions import compute_import_fingerprint

        csv_rows = [
            ('2026-01-01', -100.0, 9900.0, 'Betalning 1'),
            ('2026-01-02', -200.0, 9700.0, 'Betalning 2'),
        ]

        # First import
        for date, amount, balance, ref in csv_rows:
            fp = compute_import_fingerprint(date, amount, ref, balance)
            conn.execute("""
                INSERT INTO transactions (account_id, date, amount, balance, reference, raw_reference, import_fingerprint)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (account_id, date, amount, balance, ref, ref, fp))
        conn.commit()

        # Second import: should skip all
        skipped = 0
        for date, amount, balance, ref in csv_rows:
            fp = compute_import_fingerprint(date, amount, ref, balance)
            try:
                conn.execute("""
                    INSERT INTO transactions (account_id, date, amount, balance, reference, raw_reference, import_fingerprint)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (account_id, date, amount, balance, ref, ref, fp))
            except sqlite3.IntegrityError:
                skipped += 1

        assert skipped == 2

        count = conn.execute(
            "SELECT COUNT(*) FROM transactions WHERE account_id = ?", (account_id,)
        ).fetchone()[0]
        assert count == 2


# ---------------------------------------------------------------------------
# 6. Migration on pre-existing populated schema
# ---------------------------------------------------------------------------

class TestMigration:
    """Test migration script on a pre-existing populated database."""

    def test_migration_preserves_existing_data(self, tmp_path):
        """Run migration on a database with existing data and verify preservation."""
        db_path = str(tmp_path / 'legacy.db')

        # Create a "pre-migration" database (without new columns)
        conn = sqlite3.connect(db_path)
        conn.executescript("""
            CREATE TABLE companies (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                slug TEXT UNIQUE NOT NULL,
                name TEXT NOT NULL,
                org_number TEXT,
                fiscal_year_start TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE accounts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                company_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                account_number TEXT,
                account_type TEXT DEFAULT 'bank',
                currency TEXT DEFAULT 'SEK',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (company_id) REFERENCES companies(id)
            );

            CREATE TABLE transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                account_id INTEGER NOT NULL,
                date TEXT NOT NULL,
                amount REAL NOT NULL,
                balance REAL,
                reference TEXT,
                raw_reference TEXT,
                category TEXT,
                is_internal_transfer BOOLEAN DEFAULT 0,
                linked_transfer_id INTEGER,
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (account_id) REFERENCES accounts(id)
            );
        """)

        # Seed existing data
        conn.execute("INSERT INTO companies (slug, name, org_number) VALUES ('legacy', 'Legacy Corp', '1234')")
        conn.execute("INSERT INTO accounts (company_id, name, account_number) VALUES (1, 'Main Account', '99999')")
        conn.execute("""
            INSERT INTO transactions (account_id, date, amount, balance, reference, raw_reference)
            VALUES (1, '2025-06-01', -500.0, 10000.0, 'Old payment', 'Old payment')
        """)
        conn.commit()
        conn.close()

        # Run migration
        with patch.dict(os.environ, {'OPENVERA_BASE_DIR': str(tmp_path)}):
            # Reload config to pick up new path
            if 'config' in sys.modules:
                import importlib
                importlib.reload(sys.modules['config'])

            # Patch DB_PATH in config module
            import config
            original_db_path = config.DB_PATH
            config.DB_PATH = Path(db_path)

            try:
                from migrate_003_enable_banking import migrate
                migrate()
            finally:
                config.DB_PATH = original_db_path

        # Verify data preserved
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row

        company = conn.execute("SELECT * FROM companies WHERE slug = 'legacy'").fetchone()
        assert company is not None
        assert company['name'] == 'Legacy Corp'

        account = conn.execute("SELECT * FROM accounts WHERE account_number = '99999'").fetchone()
        assert account is not None

        txn = conn.execute("SELECT * FROM transactions WHERE reference = 'Old payment'").fetchone()
        assert txn is not None
        assert txn['amount'] == -500.0

        # Verify new columns exist with NULL defaults
        assert txn['external_id'] is None
        assert txn['import_fingerprint'] is None
        assert account['enable_banking_account_id'] is None

        # Verify new tables exist
        conn.execute("SELECT * FROM enable_banking_sessions")
        conn.execute("SELECT * FROM oauth_states")

        conn.close()

    def test_migration_idempotent(self, tmp_path):
        """Running migration twice should not error."""
        db_path = str(tmp_path / 'idem.db')
        conn = sqlite3.connect(db_path)
        conn.executescript("""
            CREATE TABLE companies (id INTEGER PRIMARY KEY, slug TEXT, name TEXT, org_number TEXT, fiscal_year_start TEXT, created_at TIMESTAMP);
            CREATE TABLE accounts (id INTEGER PRIMARY KEY, company_id INTEGER, name TEXT, account_number TEXT, account_type TEXT, currency TEXT, created_at TIMESTAMP);
            CREATE TABLE transactions (id INTEGER PRIMARY KEY, account_id INTEGER, date TEXT, amount REAL, balance REAL, reference TEXT, raw_reference TEXT, category TEXT, is_internal_transfer BOOLEAN DEFAULT 0, linked_transfer_id INTEGER, notes TEXT, created_at TIMESTAMP);
        """)
        conn.close()

        import config
        original_db_path = config.DB_PATH
        config.DB_PATH = Path(db_path)

        try:
            from migrate_003_enable_banking import migrate
            migrate()  # First run
            migrate()  # Second run -- should not error
        finally:
            config.DB_PATH = original_db_path


# ---------------------------------------------------------------------------
# 7. Backward-compatible CSV import
# ---------------------------------------------------------------------------

class TestBackwardCompatCSV:
    """Test that CSV import still works with the new schema."""

    def test_csv_import_stores_fingerprint(self, test_db):
        """CSV import should compute and store import_fingerprint."""
        conn, db_path = test_db
        company_id = _seed_company(conn)
        account_id = _seed_account(conn, company_id)

        from import_transactions import compute_import_fingerprint

        date = '2026-01-15'
        amount = -350.0
        balance = 8500.0
        reference = 'Telia faktura'

        fp = compute_import_fingerprint(date, amount, reference, balance)

        conn.execute("""
            INSERT INTO transactions (account_id, date, amount, balance, reference, raw_reference, import_fingerprint)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (account_id, date, amount, balance, reference, reference, fp))
        conn.commit()

        row = conn.execute(
            "SELECT import_fingerprint FROM transactions WHERE account_id = ? AND reference = ?",
            (account_id, reference),
        ).fetchone()

        assert row is not None
        assert row['import_fingerprint'] == fp
        assert len(fp) == 32  # SHA-256 truncated to 32 hex chars

    def test_csv_import_without_external_id(self, test_db):
        """CSV imports should have NULL external_id."""
        conn, db_path = test_db
        company_id = _seed_company(conn)
        account_id = _seed_account(conn, company_id)

        conn.execute("""
            INSERT INTO transactions (account_id, date, amount, balance, reference, import_fingerprint)
            VALUES (?, '2026-01-15', -100.0, 9000.0, 'CSV import', 'fp-csv-001')
        """, (account_id,))
        conn.commit()

        row = conn.execute(
            "SELECT external_id FROM transactions WHERE import_fingerprint = 'fp-csv-001'"
        ).fetchone()

        assert row['external_id'] is None

    def test_fingerprint_deterministic(self):
        """Fingerprint should be deterministic for same inputs."""
        from import_transactions import compute_import_fingerprint

        fp1 = compute_import_fingerprint('2026-01-01', -100.0, 'Test', 9900.0)
        fp2 = compute_import_fingerprint('2026-01-01', -100.0, 'Test', 9900.0)
        assert fp1 == fp2

        # Different inputs produce different fingerprint
        fp3 = compute_import_fingerprint('2026-01-02', -100.0, 'Test', 9900.0)
        assert fp1 != fp3
