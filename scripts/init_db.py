#!/usr/bin/env python3
"""
Initialize SQLite database for bokföring app.
"""

import sqlite3
import sys
import os
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'app'))
from config import DB_PATH

SCHEMA = """
-- Companies
CREATE TABLE IF NOT EXISTS companies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    org_number TEXT,
    fiscal_year_start TEXT,  -- MM-DD format, e.g., '05-01' for May 1
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Bank accounts
CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    account_number TEXT,
    account_type TEXT DEFAULT 'bank',  -- bank, card, cash
    currency TEXT DEFAULT 'SEK',
    enable_banking_account_id TEXT,  -- Enable Banking account identifier for API mapping
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id)
);

-- Transactions from bank statements
CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    amount REAL NOT NULL,
    balance REAL,
    reference TEXT,
    raw_reference TEXT,  -- Original reference before cleanup
    category TEXT,  -- expense, income, transfer, tax, salary, etc.
    is_internal_transfer BOOLEAN DEFAULT 0,
    linked_transfer_id INTEGER,  -- Links to matching transaction in other account
    external_id TEXT,  -- Provider-native transaction ID (e.g. Enable Banking)
    import_fingerprint TEXT,  -- Hash of date+amount+reference+balance for CSV dedup
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (account_id) REFERENCES accounts(id),
    FOREIGN KEY (linked_transfer_id) REFERENCES transactions(id)
);

-- Files (binary files, deduplicated)
CREATE TABLE IF NOT EXISTS files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filepath TEXT NOT NULL UNIQUE,  -- Relative to BASE_DIR
    filename TEXT NOT NULL,
    content_hash TEXT UNIQUE,
    mime_type TEXT,
    file_size INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Documents (invoices, receipts, etc.) - multiple can reference same file
CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_id INTEGER,
    company_id INTEGER NOT NULL,
    doc_type TEXT DEFAULT 'invoice',  -- invoice, receipt, salary, annual_report, contract, outgoing_invoice
    amount REAL,
    currency TEXT,
    amount_sek REAL,  -- Converted amount in SEK
    doc_date TEXT,
    due_date TEXT,
    invoice_number TEXT,
    ocr_number TEXT,
    processed BOOLEAN DEFAULT 0,
    needs_review BOOLEAN DEFAULT 0,
    net_amount REAL,  -- Total net (ex-VAT) amount
    vat_amount REAL,  -- Total VAT amount
    net_amount_sek REAL,  -- Net amount in SEK (for foreign-currency documents)
    vat_amount_sek REAL,  -- VAT amount in SEK (for momsdeklaration)
    vat_breakdown_json TEXT,  -- JSON array: [{"rate": 25, "net": 2000.00, "vat": 500.00}, ...]
    party_id INTEGER,
    extracted_json TEXT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (file_id) REFERENCES files(id),
    FOREIGN KEY (company_id) REFERENCES companies(id),
    FOREIGN KEY (party_id) REFERENCES parties(id)
);

-- Matches between transactions and documents
CREATE TABLE IF NOT EXISTS matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_id INTEGER NOT NULL,
    document_id INTEGER NOT NULL,
    match_type TEXT DEFAULT 'manual',  -- manual, auto, suggested
    confidence REAL,  -- 0-100 for auto matches
    matched_by TEXT,  -- 'user', 'system'
    matched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (transaction_id) REFERENCES transactions(id),
    FOREIGN KEY (document_id) REFERENCES documents(id),
    UNIQUE(transaction_id, document_id)
);

-- Transfer links (for tracking internal transfers between accounts)
CREATE TABLE IF NOT EXISTS transfers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_transaction_id INTEGER NOT NULL,
    to_transaction_id INTEGER NOT NULL,
    transfer_type TEXT DEFAULT 'internal',  -- internal, subsidiary, external
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (from_transaction_id) REFERENCES transactions(id),
    FOREIGN KEY (to_transaction_id) REFERENCES transactions(id)
);

-- Inbox for incoming files before processing
CREATE TABLE IF NOT EXISTS inbox (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filepath TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    source TEXT,  -- imessage, email, webapp
    ingested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed BOOLEAN DEFAULT 0,
    processed_at TIMESTAMP,
    document_id INTEGER,  -- Links to documents table after processing
    error TEXT,
    FOREIGN KEY (document_id) REFERENCES documents(id)
);

-- Parties (vendors, customers, authorities)
CREATE TABLE IF NOT EXISTS parties (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT,
    entity_type TEXT,  -- business, person, authority, charity
    org_number TEXT,
    patterns TEXT,  -- JSON array of matching patterns for transaction references
    default_code TEXT,  -- BAS account code for this party
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Party-company relations
CREATE TABLE IF NOT EXISTS party_relations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    party_id INTEGER NOT NULL,
    relationship TEXT,  -- vendor, customer, authority, charity
    FOREIGN KEY (company_id) REFERENCES companies(id),
    FOREIGN KEY (party_id) REFERENCES parties(id),
    UNIQUE(company_id, party_id, relationship)
);

-- BAS chart of accounts (Swedish standard)
CREATE TABLE IF NOT EXISTS bas_accounts (
    code TEXT PRIMARY KEY,
    name TEXT,
    description TEXT
);

-- Enable Banking sessions (consent/session tracking)
CREATE TABLE IF NOT EXISTS enable_banking_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    session_id TEXT NOT NULL,
    valid_until TEXT,
    status TEXT DEFAULT 'active',  -- active, expired, revoked
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id)
);

-- OAuth states for Enable Banking consent flow (CSRF protection)
CREATE TABLE IF NOT EXISTS oauth_states (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    state TEXT NOT NULL UNIQUE,
    company_id INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    used BOOLEAN DEFAULT 0,
    FOREIGN KEY (company_id) REFERENCES companies(id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_documents_company ON documents(company_id);
CREATE INDEX IF NOT EXISTS idx_documents_file ON documents(file_id);
CREATE INDEX IF NOT EXISTS idx_matches_transaction ON matches(transaction_id);
CREATE INDEX IF NOT EXISTS idx_matches_document ON matches(document_id);

-- Unique indexes for transaction deduplication
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_external_id ON transactions(account_id, external_id) WHERE external_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_import_fingerprint ON transactions(account_id, import_fingerprint) WHERE import_fingerprint IS NOT NULL;

-- Indexes for Enable Banking
CREATE INDEX IF NOT EXISTS idx_eb_sessions_company ON enable_banking_sessions(company_id);
CREATE INDEX IF NOT EXISTS idx_oauth_states_state ON oauth_states(state);
"""

def add_company(db_path, name, org_number, fiscal_year_start='01-01'):
    """Add a company to the database."""
    slug = name.lower().replace(' ', '-').replace('å', 'a').replace('ä', 'a').replace('ö', 'o')
    conn = sqlite3.connect(db_path)
    conn.execute(
        "INSERT OR IGNORE INTO companies (slug, name, org_number, fiscal_year_start) VALUES (?, ?, ?, ?)",
        (slug, name, org_number, fiscal_year_start)
    )
    conn.commit()
    conn.close()
    print(f"  Added: {name} ({org_number})")


# Standard BAS-kontoplan codes used in Swedish bookkeeping
BAS_ACCOUNTS_SEED = [
    ('1930', 'Företagskonto/checkkonto', None),
    ('1940', 'Övriga bankkonton', None),
    ('2510', 'Skatteskulder', None),
    ('2610', 'Utgående moms 25%', None),
    ('2611', 'Utgående moms 12%', None),
    ('2612', 'Utgående moms 6%', None),
    ('2614', 'Utgående moms, omvänd skattskyldighet', None),
    ('2620', 'Ingående moms', None),
    ('2640', 'Ingående moms utlandet', None),
    ('2650', 'Momsredovisningskonto', None),
    ('3000', 'Försäljning', None),
    ('3740', 'Öres- och kronutjämning', None),
    ('4000', 'Inköp av varor och material', None),
    ('5010', 'Lokalhyra', None),
    ('5310', 'El för belysning', None),
    ('5410', 'Förbrukningsinventarier', None),
    ('5460', 'Förbrukningsemballage', None),
    ('6071', 'Representation, avdragsgill', None),
    ('6212', 'Mobiltelefon', None),
    ('6230', 'Datakommunikation', None),
    ('6310', 'Företagsförsäkringar', None),
    ('6530', 'Redovisningstjänster', None),
    ('6540', 'IT-tjänster', None),
    ('6570', 'Bankkostnader', None),
    ('7010', 'Löner till tjänstemän', None),
    ('7510', 'Arbetsgivaravgifter', None),
    ('8423', 'Räntekostnader för kortfristiga skulder', None),
]


def init_db():
    """Initialize the database with schema and seed data."""
    print(f"Initializing database at {DB_PATH}")

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.executescript(SCHEMA)

    # Seed BAS chart of accounts
    cursor.executemany(
        "INSERT OR IGNORE INTO bas_accounts (code, name, description) VALUES (?, ?, ?)",
        BAS_ACCOUNTS_SEED
    )

    conn.commit()
    conn.close()

    print("Database initialized successfully!")
    return DB_PATH

if __name__ == "__main__":
    init_db()
