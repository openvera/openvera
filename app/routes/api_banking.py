"""Banking integration API routes (Enable Banking consent flow and session management)."""

import secrets
import logging
from datetime import datetime, timedelta, timezone
from functools import wraps

from flask import Blueprint, jsonify, request, redirect, url_for

from config import OPENVERA_ADMIN_TOKEN, ENABLE_BANKING_APP_ID
from db import get_db, get_company

logger = logging.getLogger(__name__)

api_banking_bp = Blueprint('api_banking', __name__)

OAUTH_STATE_TTL_MINUTES = 10


# ---------------------------------------------------------------------------
# Auth decorator
# ---------------------------------------------------------------------------

def require_admin_token(f):
    """Require OPENVERA_ADMIN_TOKEN for access. Returns 401 if missing or invalid."""
    @wraps(f)
    def decorated(*args, **kwargs):
        if not OPENVERA_ADMIN_TOKEN:
            return jsonify({'error': 'Admin token not configured'}), 500

        auth_header = request.headers.get('Authorization', '')
        token = None

        if auth_header.startswith('Bearer '):
            token = auth_header[7:]
        else:
            token = request.args.get('token')

        if not token or not secrets.compare_digest(token, OPENVERA_ADMIN_TOKEN):
            return jsonify({'error': 'Unauthorized'}), 401

        return f(*args, **kwargs)
    return decorated


# ---------------------------------------------------------------------------
# Helper: lazy-load Enable Banking client
# ---------------------------------------------------------------------------

def _get_eb_client():
    """Create an EnableBankingClient instance. Raises if not configured."""
    from enable_banking import EnableBankingClient, EnableBankingError
    if not ENABLE_BANKING_APP_ID:
        raise EnableBankingError("Enable Banking is not configured")
    return EnableBankingClient()


# ---------------------------------------------------------------------------
# Consent flow routes
# ---------------------------------------------------------------------------

@api_banking_bp.route('/api/banking/authorize/<company_slug>', methods=['POST'])
@require_admin_token
def banking_authorize(company_slug):
    """Start the Enable Banking consent/BankID authorization flow for a company."""
    from enable_banking import EnableBankingError

    company = get_company(company_slug)
    if not company:
        return jsonify({'error': 'Company not found'}), 404

    try:
        client = _get_eb_client()
    except EnableBankingError as e:
        return jsonify({'error': str(e)}), 500

    # Generate cryptographic OAuth state
    state = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(minutes=OAUTH_STATE_TTL_MINUTES)

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO oauth_states (state, company_id, created_at, expires_at)
            VALUES (?, ?, ?, ?)
        """, (state, company['id'], now.isoformat(), expires_at.isoformat()))
        conn.commit()

    # Build callback URL
    callback_url = request.url_root.rstrip('/') + url_for('api_banking.banking_callback')

    # Optional parameters from request body
    data = request.get_json(silent=True) or {}
    aspsp_name = data.get('aspsp_name', 'Handelsbanken')
    aspsp_country = data.get('aspsp_country', 'SE')
    psu_type = data.get('psu_type', 'business')

    try:
        result = client.start_authorization(
            redirect_url=callback_url,
            state=state,
            psu_type=psu_type,
            aspsp_name=aspsp_name,
            aspsp_country=aspsp_country,
        )
    except EnableBankingError as e:
        logger.error("Failed to start authorization for %s: %s", company_slug, e)
        return jsonify({'error': str(e)}), 502

    return jsonify({
        'url': result.get('url'),
        'authorization_id': result.get('authorization_id'),
        'state': state,
    })


@api_banking_bp.route('/api/banking/callback')
def banking_callback():
    """Handle redirect from Enable Banking after user authorization (BankID)."""
    from enable_banking import EnableBankingError

    code = request.args.get('code')
    state = request.args.get('state')

    if not code or not state:
        logger.warning("Callback missing code or state")
        return jsonify({'error': 'Missing code or state parameter'}), 400

    # Validate state: exists, not expired, not used
    now = datetime.now(timezone.utc)

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, company_id, expires_at, used
            FROM oauth_states WHERE state = ?
        """, (state,))
        oauth_row = cursor.fetchone()

        if not oauth_row:
            logger.warning("Callback with unknown state: %s", state[:20])
            return jsonify({'error': 'Invalid state parameter'}), 400

        if oauth_row['used']:
            logger.warning("Callback with replayed state: %s", state[:20])
            return jsonify({'error': 'State already used (replay rejected)'}), 400

        expires_at = datetime.fromisoformat(oauth_row['expires_at'])
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if now > expires_at:
            logger.warning("Callback with expired state: %s", state[:20])
            return jsonify({'error': 'State expired'}), 400

        # Mark state as used (prevent replay)
        cursor.execute("UPDATE oauth_states SET used = 1 WHERE id = ?", (oauth_row['id'],))
        conn.commit()

    company_id = oauth_row['company_id']

    # Exchange code for session
    try:
        client = _get_eb_client()
        session_data = client.create_session(code)
    except EnableBankingError as e:
        logger.error("Failed to create session: %s", e)
        return jsonify({'error': f'Session creation failed: {e}'}), 502

    session_id = session_data.get('session_id')
    valid_until = session_data.get('access', {}).get('valid_until')
    accounts = session_data.get('accounts', [])

    # Store session
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO enable_banking_sessions (company_id, session_id, valid_until, status)
            VALUES (?, ?, ?, 'active')
        """, (company_id, session_id, valid_until))

        # Auto-map accounts by IBAN / account number
        mapped_count = 0
        for eb_account in accounts:
            account_uid = eb_account.get('uid')
            iban = None
            account_id_obj = eb_account.get('account_id', {})
            if isinstance(account_id_obj, dict):
                iban = account_id_obj.get('iban')

            # Also check all_account_ids for BBAN/other identifiers
            identifiers = [iban] if iban else []
            for aid in eb_account.get('all_account_ids', []):
                if isinstance(aid, dict) and aid.get('identification'):
                    identifiers.append(aid['identification'])

            # Try to match against existing OpenVera accounts
            for identifier in identifiers:
                if not identifier:
                    continue
                # Match by full identifier or suffix (account numbers may be partial)
                cursor.execute("""
                    UPDATE accounts
                    SET enable_banking_account_id = ?
                    WHERE company_id = ?
                    AND enable_banking_account_id IS NULL
                    AND (account_number = ? OR ? LIKE '%' || account_number)
                """, (account_uid, company_id, identifier, identifier))
                if cursor.rowcount > 0:
                    mapped_count += 1
                    break

        conn.commit()

    logger.info(
        "Session created for company %d: %s, %d accounts, %d auto-mapped",
        company_id, session_id, len(accounts), mapped_count,
    )

    return jsonify({
        'ok': True,
        'session_id': session_id,
        'valid_until': valid_until,
        'accounts': len(accounts),
        'mapped_accounts': mapped_count,
    })


# ---------------------------------------------------------------------------
# Session management routes
# ---------------------------------------------------------------------------

@api_banking_bp.route('/api/banking/sessions')
@require_admin_token
def banking_sessions():
    """List all Enable Banking sessions and their status."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT s.*, c.name as company_name, c.slug as company_slug
            FROM enable_banking_sessions s
            JOIN companies c ON s.company_id = c.id
            ORDER BY s.created_at DESC
        """)
        sessions = [dict(row) for row in cursor.fetchall()]

    # Annotate with expiry status
    now = datetime.now(timezone.utc)
    for s in sessions:
        if s['valid_until']:
            try:
                valid = datetime.fromisoformat(s['valid_until'])
                if valid.tzinfo is None:
                    valid = valid.replace(tzinfo=timezone.utc)
                days_left = (valid - now).days
                s['days_until_expiry'] = days_left
                s['expiring_soon'] = 0 < days_left <= 14
                if days_left < 0 and s['status'] == 'active':
                    s['status'] = 'expired'
            except (ValueError, TypeError):
                s['days_until_expiry'] = None
                s['expiring_soon'] = False

    return jsonify(sessions)


@api_banking_bp.route('/api/banking/sessions/<session_id>', methods=['DELETE'])
@require_admin_token
def banking_delete_session(session_id):
    """Revoke an Enable Banking session."""
    from enable_banking import EnableBankingError

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id FROM enable_banking_sessions WHERE session_id = ?
        """, (session_id,))
        if not cursor.fetchone():
            return jsonify({'error': 'Session not found'}), 404

    # Revoke on Enable Banking side
    try:
        client = _get_eb_client()
        client.delete_session(session_id)
    except EnableBankingError as e:
        logger.warning("Failed to revoke session on Enable Banking: %s", e)
        # Continue to mark as revoked locally even if remote revocation fails

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE enable_banking_sessions SET status = 'revoked' WHERE session_id = ?
        """, (session_id,))
        conn.commit()

    return jsonify({'ok': True})


# ---------------------------------------------------------------------------
# Consent health / monitoring
# ---------------------------------------------------------------------------

@api_banking_bp.route('/api/banking/consent-status')
@require_admin_token
def banking_consent_status():
    """Get consent health overview for all companies."""
    with get_db() as conn:
        cursor = conn.cursor()

        # Get all companies
        cursor.execute("SELECT id, slug, name FROM companies ORDER BY name")
        companies = [dict(row) for row in cursor.fetchall()]

        now = datetime.now(timezone.utc)

        for company in companies:
            # Get the latest active session for this company
            cursor.execute("""
                SELECT session_id, valid_until, status, created_at
                FROM enable_banking_sessions
                WHERE company_id = ? AND status = 'active'
                ORDER BY created_at DESC LIMIT 1
            """, (company['id'],))
            session = cursor.fetchone()

            if session:
                company['consent_active'] = True
                company['session_id'] = session['session_id']
                company['valid_until'] = session['valid_until']

                if session['valid_until']:
                    try:
                        valid = datetime.fromisoformat(session['valid_until'])
                        if valid.tzinfo is None:
                            valid = valid.replace(tzinfo=timezone.utc)
                        days_left = (valid - now).days
                        company['days_until_expiry'] = days_left
                        company['expiring_soon'] = 0 < days_left <= 14
                        company['expired'] = days_left < 0
                    except (ValueError, TypeError):
                        company['days_until_expiry'] = None
                        company['expiring_soon'] = False
                        company['expired'] = False
                else:
                    company['days_until_expiry'] = None
                    company['expiring_soon'] = False
                    company['expired'] = False
            else:
                company['consent_active'] = False
                company['session_id'] = None
                company['valid_until'] = None
                company['days_until_expiry'] = None
                company['expiring_soon'] = False
                company['expired'] = False

            # Count mapped accounts
            cursor.execute("""
                SELECT COUNT(*) as cnt FROM accounts
                WHERE company_id = ? AND enable_banking_account_id IS NOT NULL
            """, (company['id'],))
            company['mapped_accounts'] = cursor.fetchone()['cnt']

    return jsonify(companies)
