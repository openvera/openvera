#!/usr/bin/env python3
"""
Steg 1: Ingest - Ta emot fil och placera i inbox
Ingen analys, bara registrering.

Usage:
    python3 ingest.py <filepath> [--source imessage|email|webapp]
"""

import sys
import os
import json
import shutil
from datetime import datetime
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'app'))
from config import FILES_DIR

INBOX_DIR = FILES_DIR / "inbox"
INBOX_JSON = INBOX_DIR / "inbox.json"

def ingest_file(filepath: str, source: str = "unknown") -> dict:
    """Ingest a file into the inbox."""
    filepath = Path(filepath)
    
    if not filepath.exists():
        raise FileNotFoundError(f"File not found: {filepath}")
    
    # Generate unique filename with timestamp
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    original_name = filepath.name
    
    # Handle "Unknown.pdf" and similar generic names
    if original_name.lower() in ["unknown.pdf", "image.jpg", "image.png", "file.pdf"]:
        ext = filepath.suffix
        new_name = f"{timestamp}_{source}{ext}"
    else:
        new_name = f"{timestamp}_{original_name}"
    
    dest_path = INBOX_DIR / new_name
    
    # Copy file to inbox
    shutil.copy2(filepath, dest_path)
    
    # Create inbox entry
    entry = {
        "id": timestamp,
        "filename": new_name,
        "original_name": original_name,
        "source": source,
        "ingested_at": datetime.now().isoformat(),
        "processed": False,
        "processed_at": None,
        "extracted_data": None,
        "destination": None,
        "error": None
    }
    
    # Load existing inbox
    if INBOX_JSON.exists():
        with open(INBOX_JSON, "r") as f:
            inbox = json.load(f)
    else:
        inbox = []
    
    # Add entry
    inbox.append(entry)
    
    # Save inbox
    with open(INBOX_JSON, "w") as f:
        json.dump(inbox, f, indent=2, ensure_ascii=False)
    
    return entry


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 ingest.py <filepath> [--source imessage|email|webapp]")
        sys.exit(1)
    
    filepath = sys.argv[1]
    source = "unknown"
    
    # Parse --source flag
    if "--source" in sys.argv:
        idx = sys.argv.index("--source")
        if idx + 1 < len(sys.argv):
            source = sys.argv[idx + 1]
    
    try:
        entry = ingest_file(filepath, source)
        print(f"✓ Ingested: {entry['filename']} (source: {source})")
    except Exception as e:
        print(f"✗ Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
