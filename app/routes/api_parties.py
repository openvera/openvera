"""Parties API routes."""

from flask import Blueprint, jsonify, request
import json

from db import get_db, generate_slug

api_parties_bp = Blueprint('api_parties', __name__)


def parse_patterns(patterns_str):
    """Parse patterns - handles both JSON arrays and newline-separated text."""
    if not patterns_str:
        return []
    patterns_str = patterns_str.strip()
    if patterns_str.startswith('['):
        try:
            return json.loads(patterns_str)
        except:
            pass
    return [p.strip() for p in patterns_str.split('\n') if p.strip()]


@api_parties_bp.route('/api/parties', methods=['GET'])
def api_get_parties():
    """Get all parties."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM parties ORDER BY name")
        parties = []
        for row in cursor.fetchall():
            parties.append({
                'id': row['id'],
                'name': row['name'],
                'type': row['entity_type'],
                'entity_type': row['entity_type'],
                'org_number': row['org_number'],
                'patterns': parse_patterns(row['patterns']),
                'default_code': row['default_code'] if 'default_code' in row.keys() else None
            })
    return jsonify(parties)


@api_parties_bp.route('/api/company/<slug>/parties', methods=['GET'])
def api_get_company_parties(slug):
    """Get parties related to a specific company."""
    with get_db() as conn:
        cursor = conn.cursor()
        company = cursor.execute("SELECT id FROM companies WHERE slug = ?", (slug,)).fetchone()
        if not company:
            return jsonify({'error': 'Company not found'}), 404

        cursor.execute("""
            SELECT DISTINCT p.*, pr.relationship
            FROM parties p
            JOIN party_relations pr ON p.id = pr.party_id
            WHERE pr.company_id = ?
            ORDER BY p.name
        """, (company['id'],))
        parties = []
        for row in cursor.fetchall():
            parties.append({
                'id': row['id'],
                'name': row['name'],
                'type': row['entity_type'],
                'entity_type': row['entity_type'],
                'org_number': row['org_number'],
                'patterns': parse_patterns(row['patterns']),
                'default_code': row['default_code'] if 'default_code' in row.keys() else None,
                'relationship': row['relationship'],
            })
    return jsonify(parties)


@api_parties_bp.route('/api/parties', methods=['POST'])
def api_add_party():
    """Add a new party."""
    data = request.json
    name = data.get('name', '').strip()
    entity_type = data.get('entity_type', data.get('type', 'business'))
    company_id = data.get('company_id')
    relationships = data.get('relationships', [])
    patterns_str = data.get('patterns', '')

    if entity_type in ('vendor', 'both'):
        if 'vendor' not in relationships:
            relationships.append('vendor')
    if entity_type in ('customer', 'both'):
        if 'customer' not in relationships:
            relationships.append('customer')
    if entity_type in ('vendor', 'customer', 'both'):
        entity_type = 'business'

    if not name:
        return jsonify({'error': 'Namn krävs'}), 400

    patterns = [p.strip() for p in patterns_str.split('\n') if p.strip()]

    with get_db() as conn:
        cursor = conn.cursor()

        # Generate unique slug
        base_slug = generate_slug(name)
        slug = base_slug
        counter = 2
        while cursor.execute("SELECT 1 FROM parties WHERE slug = ?", (slug,)).fetchone():
            slug = f"{base_slug}-{counter}"
            counter += 1

        cursor.execute("""
            INSERT INTO parties (name, entity_type, patterns, slug)
            VALUES (?, ?, ?, ?)
        """, (name, entity_type, json.dumps(patterns), slug))
        party_id = cursor.lastrowid

        if company_id and relationships:
            for rel in relationships:
                cursor.execute("""
                    INSERT OR IGNORE INTO party_relations (company_id, party_id, relationship)
                    VALUES (?, ?, ?)
                """, (company_id, party_id, rel))

        conn.commit()

    return jsonify({'ok': True, 'party_id': party_id})


@api_parties_bp.route('/api/parties/<int:party_id>', methods=['GET'])
def api_get_party(party_id):
    """Get single party details."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM parties WHERE id = ?", (party_id,))
        row = cursor.fetchone()
        if not row:
            return jsonify({'error': 'Not found'}), 404

        return jsonify({
            'id': row['id'],
            'name': row['name'],
            'entity_type': row['entity_type'],
            'type': row['entity_type'],
            'org_number': row['org_number'],
            'patterns': json.loads(row['patterns']) if row['patterns'] else [],
            'default_code': row['default_code'] if 'default_code' in row.keys() else None,
        })


@api_parties_bp.route('/api/parties/<int:party_id>', methods=['PUT'])
def api_update_party(party_id):
    """Update a party."""
    data = request.json
    name = data.get('name', '').strip()
    entity_type = data.get('entity_type', data.get('type', 'business'))
    company_id = data.get('company_id')
    relationships = data.get('relationships')
    default_code = data.get('default_code', '').strip() or None
    patterns_str = data.get('patterns', '')

    if entity_type in ('vendor', 'customer', 'both') and relationships is None:
        relationships = []
        if entity_type in ('vendor', 'both'):
            relationships.append('vendor')
        if entity_type in ('customer', 'both'):
            relationships.append('customer')
        entity_type = 'business'

    patterns = [p.strip() for p in patterns_str.split('\n') if p.strip()]

    with get_db() as conn:
        cursor = conn.cursor()

        # Regenerate slug if name changed
        current = cursor.execute("SELECT name FROM parties WHERE id = ?", (party_id,)).fetchone()
        if current and current['name'] != name:
            base_slug = generate_slug(name)
            slug = base_slug
            counter = 2
            while cursor.execute("SELECT 1 FROM parties WHERE slug = ? AND id != ?", (slug, party_id)).fetchone():
                slug = f"{base_slug}-{counter}"
                counter += 1
            cursor.execute("""
                UPDATE parties SET name = ?, entity_type = ?, default_code = ?, patterns = ?, slug = ?
                WHERE id = ?
            """, (name, entity_type, default_code, json.dumps(patterns), slug, party_id))
        else:
            cursor.execute("""
                UPDATE parties SET name = ?, entity_type = ?, default_code = ?, patterns = ?
                WHERE id = ?
            """, (name, entity_type, default_code, json.dumps(patterns), party_id))

        if company_id and relationships is not None:
            cursor.execute("""
                DELETE FROM party_relations WHERE company_id = ? AND party_id = ?
            """, (company_id, party_id))
            for rel in relationships:
                cursor.execute("""
                    INSERT INTO party_relations (company_id, party_id, relationship)
                    VALUES (?, ?, ?)
                """, (company_id, party_id, rel))

        conn.commit()

    return jsonify({'ok': True})


@api_parties_bp.route('/api/parties/<int:party_id>', methods=['DELETE'])
def api_delete_party(party_id):
    """Delete a party and all its relations."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM party_relations WHERE party_id = ?", (party_id,))
        cursor.execute("DELETE FROM parties WHERE id = ?", (party_id,))
        conn.commit()
    return jsonify({'ok': True})


@api_parties_bp.route('/api/parties/<int:party_id>/relations')
def api_get_party_relations(party_id):
    """Get all relations for a specific party."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT pr.company_id, pr.relationship, c.name as company_name
            FROM party_relations pr
            JOIN companies c ON pr.company_id = c.id
            WHERE pr.party_id = ?
            ORDER BY c.name
        """, (party_id,))
        relations = [{'company_id': r['company_id'], 'company_name': r['company_name'],
                      'relationship': r['relationship']} for r in cursor.fetchall()]
    return jsonify(relations)


@api_parties_bp.route('/api/party-relations', methods=['POST'])
def api_add_party_relation():
    """Add a relation between party and company."""
    data = request.json
    company_id = data.get('company_id')
    party_id = data.get('party_id')
    relationship = data.get('relationship', 'vendor')

    if not company_id or not party_id:
        return jsonify({'error': 'company_id och party_id krävs'}), 400

    if relationship not in ('vendor', 'customer', 'authority', 'charity'):
        return jsonify({'error': 'Ogiltig relation'}), 400

    with get_db() as conn:
        cursor = conn.cursor()
        try:
            cursor.execute("""
                INSERT INTO party_relations (company_id, party_id, relationship)
                VALUES (?, ?, ?)
            """, (company_id, party_id, relationship))
            conn.commit()
        except Exception as e:
            if 'UNIQUE constraint' in str(e):
                return jsonify({'error': 'Relationen finns redan'}), 400
            raise

    return jsonify({'ok': True})


@api_parties_bp.route('/api/party-relations', methods=['DELETE'])
def api_delete_party_relation():
    """Remove relation(s) between party and company."""
    data = request.json
    company_id = data.get('company_id')
    party_id = data.get('party_id')
    relationship = data.get('relationship')

    if not company_id or not party_id:
        return jsonify({'error': 'company_id och party_id krävs'}), 400

    with get_db() as conn:
        cursor = conn.cursor()
        if relationship:
            cursor.execute("""
                DELETE FROM party_relations
                WHERE company_id = ? AND party_id = ? AND relationship = ?
            """, (company_id, party_id, relationship))
        else:
            cursor.execute("""
                DELETE FROM party_relations
                WHERE company_id = ? AND party_id = ?
            """, (company_id, party_id))
        conn.commit()

    return jsonify({'ok': True})


@api_parties_bp.route('/api/parties/<int:party_id>/transactions')
def api_party_transactions(party_id):
    """Get transactions matching a party's patterns."""
    with get_db() as conn:
        cursor = conn.cursor()

        cursor.execute("SELECT patterns FROM parties WHERE id = ?", (party_id,))
        row = cursor.fetchone()
        if not row:
            return jsonify({'error': 'Party not found'}), 404

        patterns = json.loads(row['patterns']) if row['patterns'] else []
        if not patterns:
            return jsonify({'transactions': []})

        conditions = []
        params = []
        for pattern in patterns:
            conditions.append("t.reference LIKE ?")
            params.append(f'%{pattern}%')

        where_clause = ' OR '.join(conditions)

        cursor.execute(f"""
            SELECT t.id, t.date, t.reference, t.amount,
                   a.id as account_id, a.name as account,
                   c.id as company_id, c.name as company, c.slug as company_slug
            FROM transactions t
            JOIN accounts a ON t.account_id = a.id
            JOIN companies c ON a.company_id = c.id
            WHERE {where_clause}
            ORDER BY t.date DESC
            LIMIT 100
        """, params)

        transactions = []
        for row in cursor.fetchall():
            transactions.append({
                'id': row['id'],
                'date': row['date'],
                'reference': row['reference'],
                'amount': row['amount'],
                'account_id': row['account_id'],
                'account': row['account'],
                'company_id': row['company_id'],
                'company': row['company'],
                'company_slug': row['company_slug'],
            })

    return jsonify({'transactions': transactions})


@api_parties_bp.route('/api/bas-accounts')
def api_get_bas_accounts():
    """Get all BAS account codes."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT code, name, description FROM bas_accounts ORDER BY code")
        accounts = []
        for row in cursor.fetchall():
            accounts.append({
                'code': row['code'],
                'name': row['name'],
                'description': row['description']
            })
    return jsonify(accounts)
