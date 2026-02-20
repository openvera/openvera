#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Parse PDF invoices and extract structured data.
Saves results to invoices.json
"""

import pdfplumber
import json
import re
import os
from pathlib import Path
from datetime import datetime

import sqlite3
from config import FILES_DIR, DB_PATH

def extract_amounts(text):
    """Extract monetary amounts from text"""
    amounts = []
    
    # Pattern for amounts like: 19.54 EUR, €19.54, 19,54 €, $7.00, 1 234,56 kr
    patterns = [
        r'(\d+[.,]\d{2})\s*(EUR|USD|\$|€|SEK|kr)',
        r'(EUR|USD|\$|€)\s*(\d+[.,]\d{2})',
        r'(\d{1,3}(?:[\s,]\d{3})*[.,]\d{2})\s*(kr|SEK)',
    ]
    
    for pattern in patterns:
        matches = re.findall(pattern, text, re.IGNORECASE)
        for match in matches:
            if isinstance(match, tuple):
                # Determine which group is amount and which is currency
                if match[0] in ['EUR', 'USD', '$', '€', 'SEK', 'kr']:
                    currency = match[0]
                    amount = match[1]
                else:
                    amount = match[0]
                    currency = match[1]
                
                # Normalize currency
                currency = currency.upper().replace('€', 'EUR').replace('$', 'USD').replace('KR', 'SEK')
                
                # Normalize amount
                amount = amount.replace(' ', '').replace(',', '.')
                try:
                    amount = float(amount)
                    amounts.append({'amount': amount, 'currency': currency})
                except:
                    pass
    
    return amounts

def extract_invoice_number(text):
    """Extract invoice number"""
    patterns = [
        r'Invoice\s*#?\s*:?\s*(\d+[-\d]*)',
        r'Faktura\s*(?:nr|nummer)?\s*:?\s*(\d+)',
        r'Invoice\s+Number[:\s]+([A-Z0-9-]+)',
        r'Receipt\s*#?\s*:?\s*(\d+-\d+)',
    ]
    
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return match.group(1)
    return None

def extract_date(text):
    """Extract date from text"""
    patterns = [
        r'(\d{4}-\d{2}-\d{2})',
        r'(\d{2}/\d{2}/\d{4})',
        r'(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})',
    ]
    
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return match.group(1)
    return None

def _load_party_patterns():
    """Load vendor patterns from parties table."""
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("SELECT name, patterns FROM parties WHERE patterns IS NOT NULL AND patterns != '' AND patterns != '[]'")
        result = []
        for row in cursor.fetchall():
            patterns = row['patterns']
            if patterns and patterns.startswith('['):
                import json as _json
                patterns = _json.loads(patterns)
            else:
                patterns = [p.strip() for p in (patterns or '').split('\n') if p.strip()]
            result.append((row['name'], patterns))
        conn.close()
        return result
    except Exception:
        return []


def identify_vendor(text, filename):
    """Identify vendor from text or filename using parties table patterns."""
    combined = (text + ' ' + filename).lower()
    for name, patterns in _load_party_patterns():
        if any(p.lower() in combined for p in patterns):
            return name
    return 'Unknown'

def parse_pdf(filepath):
    """Parse a single PDF and extract data"""
    result = {
        'file': str(filepath),
        'filename': filepath.name,
        'vendor': None,
        'invoice_number': None,
        'date': None,
        'amounts': [],
        'total_eur': None,
        'total_usd': None,
        'total_sek': None,
        'raw_text': None,
        'parse_error': None
    }
    
    try:
        with pdfplumber.open(filepath) as pdf:
            text = ''
            for page in pdf.pages[:3]:  # First 3 pages should be enough
                page_text = page.extract_text() or ''
                text += page_text + '\n'
            
            result['raw_text'] = text[:2000]  # Store first 2000 chars for debugging
            result['vendor'] = identify_vendor(text, filepath.name)
            result['invoice_number'] = extract_invoice_number(text)
            result['date'] = extract_date(text)
            result['amounts'] = extract_amounts(text)
            
            # Find totals per currency
            for amt in result['amounts']:
                if amt['currency'] == 'EUR' and (result['total_eur'] is None or amt['amount'] > result['total_eur']):
                    result['total_eur'] = amt['amount']
                elif amt['currency'] == 'USD' and (result['total_usd'] is None or amt['amount'] > result['total_usd']):
                    result['total_usd'] = amt['amount']
                elif amt['currency'] == 'SEK' and (result['total_sek'] is None or amt['amount'] > result['total_sek']):
                    result['total_sek'] = amt['amount']
                    
    except Exception as e:
        result['parse_error'] = str(e)
    
    return result

def parse_all_invoices():
    """Parse all PDF invoices in Bokforing directory"""
    all_invoices = []
    
    for pdf_file in FILES_DIR.glob('**/*.pdf'):
        print(f"Parsing: {pdf_file.name}")
        data = parse_pdf(pdf_file)
        # Remove raw_text from output to keep JSON smaller
        data.pop('raw_text', None)
        all_invoices.append(data)
    
    # Save to JSON
    output_path = FILES_DIR / 'invoices.json'
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(all_invoices, f, indent=2, ensure_ascii=False)
    
    print(f"\nParsed {len(all_invoices)} invoices")
    print(f"Saved to: {output_path}")
    
    # Summary
    vendors = {}
    for inv in all_invoices:
        v = inv['vendor']
        vendors[v] = vendors.get(v, 0) + 1
    
    print("\nVendors found:")
    for v, count in sorted(vendors.items(), key=lambda x: -x[1]):
        print(f"  {v}: {count}")
    
    return all_invoices

if __name__ == '__main__':
    parse_all_invoices()
