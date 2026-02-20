#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""OpenVera — Bokföring"""

from flask import Flask, send_from_directory
from flask_wtf.csrf import CSRFProtect, generate_csrf
import os

from config import DB_PATH, PORT, IS_DEV, OPENVERA_ENV

FRONTEND_DIST = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'frontend', 'dist')

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', os.urandom(32))
csrf = CSRFProtect(app)
app.config['WTF_CSRF_ENABLED'] = False
app.config['TEMPLATES_AUTO_RELOAD'] = IS_DEV
app.jinja_env.auto_reload = IS_DEV


@app.context_processor
def inject_csrf_token():
    """Make CSRF token available in all templates."""
    return {'csrf_token': generate_csrf}


@app.after_request
def add_no_cache(response):
    response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
    return response


# Register blueprints
from routes.api_documents import api_documents_bp
from routes.api_parties import api_parties_bp
from routes.api_transactions import api_transactions_bp
from routes.api_companies import api_companies_bp
from routes.api_banking import api_banking_bp

app.register_blueprint(api_documents_bp)
app.register_blueprint(api_parties_bp)
app.register_blueprint(api_transactions_bp)
app.register_blueprint(api_companies_bp)
app.register_blueprint(api_banking_bp)

# Ensure party slugs are backfilled
from db import ensure_party_slugs
ensure_party_slugs()


# SPA catch-all: serve frontend dist if it exists
if os.path.isdir(FRONTEND_DIST):
    @app.route('/', defaults={'path': ''})
    @app.route('/<path:path>')
    def serve_spa(path):
        # Serve static assets (JS, CSS, images)
        file_path = os.path.join(FRONTEND_DIST, path)
        if path and os.path.isfile(file_path):
            return send_from_directory(FRONTEND_DIST, path)
        # Fallback to index.html for client-side routing
        return send_from_directory(FRONTEND_DIST, 'index.html')


if __name__ == "__main__":
    print("Starting OpenVera")
    print(f"Environment: {OPENVERA_ENV}")
    print(f"Database: {DB_PATH}")
    print(f"Open http://localhost:{PORT}")
    app.run(host="0.0.0.0", port=PORT, debug=IS_DEV)
