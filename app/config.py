"""Central configuration for Vera."""
import os
from pathlib import Path

BASE_DIR = Path(os.environ.get('VERA_BASE_DIR', Path(__file__).resolve().parent.parent / "data"))
DB_PATH = BASE_DIR / "vera.db"
FILES_DIR = Path(os.environ.get('VERA_FILES_DIR', '')) if os.environ.get('VERA_FILES_DIR') else BASE_DIR / 'files'
PORT = int(os.environ.get('VERA_PORT', 8888))

# Runtime environment mode.
# Defaults to production-safe behavior unless explicitly set to dev.
VERA_ENV = os.environ.get('VERA_ENV', 'prod').strip().lower()
IS_DEV = VERA_ENV in {'dev', 'development'}
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
VERA_ADMIN_TOKEN = os.environ.get('VERA_ADMIN_TOKEN', '')
