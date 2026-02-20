"""Central configuration for OpenVera."""
import os
from pathlib import Path

BASE_DIR = Path(os.environ.get('OPENVERA_BASE_DIR', Path(__file__).resolve().parent.parent / "data"))
DB_PATH = BASE_DIR / "openvera.db"
FILES_DIR = Path(os.environ.get('OPENVERA_FILES_DIR', '')) if os.environ.get('OPENVERA_FILES_DIR') else BASE_DIR / 'files'
PORT = int(os.environ.get('OPENVERA_PORT', 8888))

# Runtime environment mode.
# Defaults to production-safe behavior unless explicitly set to dev.
OPENVERA_ENV = os.environ.get('OPENVERA_ENV', 'prod').strip().lower()
IS_DEV = OPENVERA_ENV in {'dev', 'development'}
IS_PROD = not IS_DEV

# Document types excluded from inbox (categorized, don't need matching)
CATEGORIZED_DOC_TYPES = {
    'resultatrapport', 'balansrapport', 'betalningssammanstalning',
    'kvittens', 'salary', 'reminder', 'credit_note',
}

# Enable Banking integration (optional -- leave empty to disable)
ENABLE_BANKING_APP_ID = os.environ.get('ENABLE_BANKING_APP_ID', '')
ENABLE_BANKING_PRIVATE_KEY_PATH = os.environ.get('ENABLE_BANKING_PRIVATE_KEY_PATH', '')

# Admin token for banking API routes (required for /api/banking/*)
OPENVERA_ADMIN_TOKEN = os.environ.get('OPENVERA_ADMIN_TOKEN', '')
