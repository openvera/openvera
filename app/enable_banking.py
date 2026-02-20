"""
Enable Banking API client for OpenVera.

Wraps the Enable Banking REST API (https://api.enablebanking.com) for AISP
(Account Information Service Provider) operations: consent authorization,
account listing, balance retrieval, and transaction fetching.

Authentication uses RS256-signed JWTs with the application ID as key ID.
"""

import time
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path

import jwt
import requests

from config import ENABLE_BANKING_APP_ID, ENABLE_BANKING_PRIVATE_KEY_PATH

logger = logging.getLogger(__name__)

API_BASE_URL = "https://api.enablebanking.com"
JWT_MAX_TTL = 3600  # 1 hour (well within the 86400s maximum)


class EnableBankingError(Exception):
    """Base exception for Enable Banking API errors."""

    def __init__(self, message, status_code=None, response_body=None):
        super().__init__(message)
        self.status_code = status_code
        self.response_body = response_body


class EnableBankingClient:
    """Client for the Enable Banking REST API."""

    def __init__(self, app_id=None, private_key_path=None):
        self.app_id = app_id or ENABLE_BANKING_APP_ID
        self.private_key_path = private_key_path or ENABLE_BANKING_PRIVATE_KEY_PATH
        self._private_key = None

        if not self.app_id:
            raise EnableBankingError("ENABLE_BANKING_APP_ID not configured")
        if not self.private_key_path:
            raise EnableBankingError("ENABLE_BANKING_PRIVATE_KEY_PATH not configured")

    @property
    def private_key(self):
        """Lazy-load the RSA private key from file."""
        if self._private_key is None:
            key_path = Path(self.private_key_path)
            if not key_path.exists():
                raise EnableBankingError(
                    f"Private key file not found: {self.private_key_path}"
                )
            self._private_key = key_path.read_text()
        return self._private_key

    def _generate_jwt(self):
        """Generate a signed JWT for API authentication."""
        now = int(time.time())
        payload = {
            "iss": "enablebanking.com",
            "aud": "api.enablebanking.com",
            "iat": now,
            "exp": now + JWT_MAX_TTL,
        }
        headers = {
            "typ": "JWT",
            "alg": "RS256",
            "kid": self.app_id,
        }
        return jwt.encode(payload, self.private_key, algorithm="RS256", headers=headers)

    def _request(self, method, path, json_data=None, params=None):
        """Make an authenticated API request."""
        url = f"{API_BASE_URL}{path}"
        token = self._generate_jwt()
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }

        try:
            response = requests.request(
                method, url, headers=headers, json=json_data, params=params, timeout=30
            )
        except requests.RequestException as e:
            raise EnableBankingError(f"API request failed: {e}")

        if response.status_code >= 400:
            try:
                body = response.json()
            except ValueError:
                body = response.text
            raise EnableBankingError(
                f"API error {response.status_code}: {body}",
                status_code=response.status_code,
                response_body=body,
            )

        if response.status_code == 204:
            return None

        return response.json()

    def start_authorization(self, redirect_url, state, valid_until=None,
                            psu_type="business", aspsp_name="Handelsbanken",
                            aspsp_country="SE"):
        """
        Start the authorization/consent flow.

        Returns dict with 'url' (redirect the user here) and 'authorization_id'.
        """
        if not valid_until:
            valid_until = (
                datetime.now(timezone.utc) + timedelta(days=90)
            ).strftime("%Y-%m-%dT%H:%M:%S.000Z")

        body = {
            "access": {
                "valid_until": valid_until,
            },
            "aspsp": {
                "name": aspsp_name,
                "country": aspsp_country,
            },
            "state": state,
            "redirect_url": redirect_url,
            "psu_type": psu_type,
        }

        result = self._request("POST", "/auth", json_data=body)
        logger.info("Authorization started, redirect URL: %s", result.get("url"))
        return result

    def create_session(self, code):
        """
        Exchange authorization code for a session.

        Returns dict with 'session_id', 'accounts', 'access' (including valid_until).
        """
        result = self._request("POST", "/sessions", json_data={"code": code})
        logger.info(
            "Session created: %s with %d accounts",
            result.get("session_id"),
            len(result.get("accounts", [])),
        )
        return result

    def get_session(self, session_id):
        """Get session information including status and validity."""
        return self._request("GET", f"/sessions/{session_id}")

    def delete_session(self, session_id):
        """Delete/revoke a session and its ASPSP consent."""
        self._request("DELETE", f"/sessions/{session_id}")
        logger.info("Session deleted: %s", session_id)

    def get_account_details(self, account_id):
        """Get detailed account information."""
        return self._request("GET", f"/accounts/{account_id}/details")

    def get_balances(self, account_id):
        """Fetch account balances."""
        return self._request("GET", f"/accounts/{account_id}/balances")

    def get_transactions(self, account_id, date_from=None, date_to=None):
        """
        Fetch transactions for an account, handling pagination.

        Returns the full list of transactions across all pages.
        """
        params = {}
        if date_from:
            params["date_from"] = date_from
        if date_to:
            params["date_to"] = date_to

        all_transactions = []
        continuation_key = None

        while True:
            if continuation_key:
                params["continuation_key"] = continuation_key

            result = self._request(
                "GET", f"/accounts/{account_id}/transactions", params=params
            )

            transactions = result.get("transactions", [])
            all_transactions.extend(transactions)

            continuation_key = result.get("continuation_key")
            if not continuation_key:
                break

            logger.debug(
                "Fetched %d transactions, continuing with key: %s",
                len(transactions),
                continuation_key[:20] if continuation_key else "",
            )

        logger.info(
            "Fetched %d total transactions for account %s",
            len(all_transactions),
            account_id,
        )
        return all_transactions
