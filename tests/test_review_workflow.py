#!/usr/bin/env python3
"""
Tests for the split review workflow introduced in issue #13.
"""

import importlib
import os
import sqlite3
import sys
from pathlib import Path

import pytest

APP_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'app')
SCRIPTS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'scripts')
sys.path.insert(0, APP_DIR)
sys.path.insert(0, SCRIPTS_DIR)


def _init_test_db(db_path):
    """Initialize a test database with the current schema."""
    init_db_path = os.path.join(SCRIPTS_DIR, 'init_db.py')
    spec = importlib.util.spec_from_file_location("init_db_mod", init_db_path)
    mod = importlib.util.module_from_spec(spec)

    with pytest.MonkeyPatch.context() as mp:
        mp.setenv('OPENVERA_BASE_DIR', str(Path(db_path).parent))
        if 'config' in sys.modules:
            importlib.reload(sys.modules['config'])
        spec.loader.exec_module(mod)

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.executescript(mod.SCHEMA)
    conn.commit()
    return conn


def _seed_company(conn, name='TestCo', slug='testco'):
    conn.execute(
        "INSERT INTO companies (slug, name, org_number) VALUES (?, ?, ?)",
        (slug, name, '5561234567'),
    )
    conn.commit()
    return conn.execute("SELECT id FROM companies WHERE slug = ?", (slug,)).fetchone()['id']


def _seed_account(conn, company_id):
    conn.execute(
        "INSERT INTO accounts (company_id, name, account_number) VALUES (?, ?, ?)",
        (company_id, 'Företagskonto', '12345678901'),
    )
    conn.commit()
    return conn.execute(
        "SELECT id FROM accounts WHERE company_id = ? ORDER BY id DESC LIMIT 1",
        (company_id,),
    ).fetchone()['id']


def _seed_transaction(conn, account_id, amount=-125.0, date='2026-01-10', reference='Kortkop'):
    conn.execute("""
        INSERT INTO transactions (account_id, date, amount, reference, category)
        VALUES (?, ?, ?, ?, 'expense')
    """, (account_id, date, amount, reference))
    conn.commit()
    return conn.execute("SELECT id FROM transactions ORDER BY id DESC LIMIT 1").fetchone()['id']


def _seed_document(
    conn,
    company_id,
    *,
    doc_type='invoice',
    amount=125.0,
    doc_date='2026-01-09',
    net_amount=100.0,
    vat_amount=25.0,
    net_amount_sek=100.0,
    vat_amount_sek=25.0,
):
    conn.execute("""
        INSERT INTO documents (
            company_id, doc_type, amount, currency, amount_sek, doc_date,
            net_amount, vat_amount, net_amount_sek, vat_amount_sek
        )
        VALUES (?, ?, ?, 'SEK', ?, ?, ?, ?, ?, ?)
    """, (
        company_id,
        doc_type,
        amount,
        amount,
        doc_date,
        net_amount,
        vat_amount,
        net_amount_sek,
        vat_amount_sek,
    ))
    conn.commit()
    return conn.execute("SELECT id FROM documents ORDER BY id DESC LIMIT 1").fetchone()['id']


@pytest.fixture
def test_db(tmp_path):
    db_path = str(tmp_path / 'test.db')
    conn = _init_test_db(db_path)
    yield conn, db_path
    conn.close()


@pytest.fixture
def app_client(test_db, monkeypatch):
    conn, db_path = test_db

    monkeypatch.setenv('OPENVERA_BASE_DIR', str(Path(db_path).parent))
    monkeypatch.setenv('OPENVERA_ADMIN_TOKEN', 'test-admin-token-secret')
    monkeypatch.setenv('ENABLE_BANKING_APP_ID', 'test-app-id')
    monkeypatch.setenv('ENABLE_BANKING_PRIVATE_KEY_PATH', '/tmp/test-key.pem')

    if 'config' in sys.modules:
        importlib.reload(sys.modules['config'])

    import config
    monkeypatch.setattr(config, 'DB_PATH', Path(db_path))
    monkeypatch.setattr(config, 'OPENVERA_ADMIN_TOKEN', 'test-admin-token-secret')
    monkeypatch.setattr(config, 'ENABLE_BANKING_APP_ID', 'test-app-id')
    monkeypatch.setattr(config, 'ENABLE_BANKING_PRIVATE_KEY_PATH', '/tmp/test-key.pem')

    if 'db' in sys.modules:
        importlib.reload(sys.modules['db'])
    if 'app' in sys.modules:
        importlib.reload(sys.modules['app'])

    from app import app

    app.config['TESTING'] = True
    app.config['WTF_CSRF_ENABLED'] = False

    with app.test_client() as client:
        yield client, conn


def test_verify_data_sets_document_data_verified_but_not_reviewed(app_client):
    client, conn = app_client
    company_id = _seed_company(conn)
    doc_id = _seed_document(conn, company_id, doc_type='invoice')

    resp = client.post(f'/api/document/{doc_id}/verify-data', json={})
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['verified'] is True

    row = conn.execute("""
        SELECT data_verified_at, reviewed_at
        FROM documents
        WHERE id = ?
    """, (doc_id,)).fetchone()
    assert row['data_verified_at'] is not None
    assert row['reviewed_at'] is None


def test_match_creation_requires_verified_pdf_data(app_client):
    client, conn = app_client
    company_id = _seed_company(conn)
    account_id = _seed_account(conn, company_id)
    txn_id = _seed_transaction(conn, account_id)
    doc_id = _seed_document(conn, company_id, doc_type='invoice')

    resp = client.post('/api/matches', json={
        'transaction_id': txn_id,
        'document_id': doc_id,
    })
    assert resp.status_code == 400
    assert 'Verifiera PDF-data' in resp.get_json()['error']


def test_verified_manual_match_is_auto_approved_and_marks_document_reviewed(app_client):
    client, conn = app_client
    company_id = _seed_company(conn)
    account_id = _seed_account(conn, company_id)
    txn_id = _seed_transaction(conn, account_id)
    doc_id = _seed_document(conn, company_id, doc_type='invoice')

    verify_resp = client.post(f'/api/document/{doc_id}/verify-data', json={})
    assert verify_resp.status_code == 200

    match_resp = client.post('/api/matches', json={
        'transaction_id': txn_id,
        'document_id': doc_id,
    })
    assert match_resp.status_code == 200

    match_row = conn.execute("""
        SELECT approved_at
        FROM matches
        WHERE transaction_id = ? AND document_id = ?
    """, (txn_id, doc_id)).fetchone()
    assert match_row['approved_at'] is not None

    doc_row = conn.execute("""
        SELECT data_verified_at, reviewed_at
        FROM documents
        WHERE id = ?
    """, (doc_id,)).fetchone()
    assert doc_row['data_verified_at'] is not None
    assert doc_row['reviewed_at'] is not None


def test_match_approval_requires_verified_pdf_data(app_client):
    client, conn = app_client
    company_id = _seed_company(conn)
    account_id = _seed_account(conn, company_id)
    txn_id = _seed_transaction(conn, account_id)
    doc_id = _seed_document(conn, company_id, doc_type='invoice')

    conn.execute("""
        INSERT INTO matches (transaction_id, document_id, match_type, matched_by, confidence)
        VALUES (?, ?, 'suggested', 'system', 97.0)
    """, (txn_id, doc_id))
    conn.commit()
    match_id = conn.execute("SELECT id FROM matches ORDER BY id DESC LIMIT 1").fetchone()['id']

    blocked = client.post(f'/api/matches/{match_id}/approve', json={})
    assert blocked.status_code == 400

    verified = client.post(f'/api/document/{doc_id}/verify-data', json={})
    assert verified.status_code == 200

    approved = client.post(f'/api/matches/{match_id}/approve', json={})
    assert approved.status_code == 200

    row = conn.execute("""
        SELECT approved_at, match_type
        FROM matches
        WHERE id = ?
    """, (match_id,)).fetchone()
    assert row['approved_at'] is not None
    assert row['match_type'] == 'approved'


def test_vat_report_only_counts_approved_matches(app_client):
    client, conn = app_client
    company_id = _seed_company(conn)
    account_id = _seed_account(conn, company_id)

    approved_txn = _seed_transaction(conn, account_id, amount=-125.0, reference='Approved payment')
    approved_doc = _seed_document(conn, company_id, doc_type='invoice', amount=125.0, net_amount=100.0, vat_amount=25.0)
    client.post(f'/api/document/{approved_doc}/verify-data', json={})
    client.post('/api/matches', json={'transaction_id': approved_txn, 'document_id': approved_doc})

    pending_txn = _seed_transaction(conn, account_id, amount=-250.0, reference='Pending payment')
    pending_doc = _seed_document(conn, company_id, doc_type='invoice', amount=250.0, net_amount=200.0, vat_amount=50.0, net_amount_sek=200.0, vat_amount_sek=50.0)
    client.post(f'/api/document/{pending_doc}/verify-data', json={})
    conn.execute("""
        INSERT INTO matches (transaction_id, document_id, match_type, matched_by, confidence)
        VALUES (?, ?, 'suggested', 'system', 96.0)
    """, (pending_txn, pending_doc))
    conn.commit()

    resp = client.get(f'/api/report/vat?company_id={company_id}&from=2026-01-01&to=2026-12-31')
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['totals']['net_sek'] == 100.0
    assert data['totals']['vat_sek'] == 25.0
    assert data['incoming_vat_sek'] == 25.0


def test_delete_transaction_recomputes_document_review_state(app_client):
    client, conn = app_client
    company_id = _seed_company(conn)
    account_id = _seed_account(conn, company_id)
    txn_id = _seed_transaction(conn, account_id)
    doc_id = _seed_document(conn, company_id, doc_type='invoice')

    client.post(f'/api/document/{doc_id}/verify-data', json={})
    client.post('/api/matches', json={'transaction_id': txn_id, 'document_id': doc_id})

    resp = client.delete(f'/api/transaction/{txn_id}')
    assert resp.status_code == 200

    doc_row = conn.execute("""
        SELECT data_verified_at, reviewed_at
        FROM documents
        WHERE id = ?
    """, (doc_id,)).fetchone()
    assert doc_row['data_verified_at'] is not None
    assert doc_row['reviewed_at'] is None

    match_count = conn.execute("""
        SELECT COUNT(*) AS count
        FROM matches
        WHERE document_id = ?
    """, (doc_id,)).fetchone()['count']
    assert match_count == 0


def test_delete_account_recomputes_document_review_state(app_client):
    client, conn = app_client
    company_id = _seed_company(conn)
    account_id = _seed_account(conn, company_id)
    txn_id = _seed_transaction(conn, account_id)
    doc_id = _seed_document(conn, company_id, doc_type='invoice')

    client.post(f'/api/document/{doc_id}/verify-data', json={})
    client.post('/api/matches', json={'transaction_id': txn_id, 'document_id': doc_id})

    resp = client.delete(f'/api/accounts/{account_id}')
    assert resp.status_code == 200

    doc_row = conn.execute("""
        SELECT data_verified_at, reviewed_at
        FROM documents
        WHERE id = ?
    """, (doc_id,)).fetchone()
    assert doc_row['data_verified_at'] is not None
    assert doc_row['reviewed_at'] is None

    match_count = conn.execute("""
        SELECT COUNT(*) AS count
        FROM matches
        WHERE document_id = ?
    """, (doc_id,)).fetchone()['count']
    assert match_count == 0
