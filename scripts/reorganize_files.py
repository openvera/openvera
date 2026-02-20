#!/usr/bin/env python3
"""Reorganize openvera-data folder structure.

Moves files into a flat {company-slug}/{year}/{filename} structure.
Updates DB paths to match. Handles non-DB files separately.

Target structure:
    openvera-data/
      {company-slug}/{year}/{filename}   # All documents flat per year
      inbox/                              # Unprocessed / unassigned

Usage:
    python scripts/reorganize_files.py --dry-run   # Preview changes
    python scripts/reorganize_files.py              # Execute moves
    python scripts/reorganize_files.py --verbose    # Show each move
"""

import argparse
import hashlib
import os
import re
import shutil
import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'app'))
from config import FILES_DIR, DB_PATH


def file_hash(path):
    """MD5 hash of file contents."""
    h = hashlib.md5()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(8192), b''):
            h.update(chunk)
    return h.hexdigest()


def safe_move(src, dst, dry_run=False):
    """Move file, handling collisions by content hash comparison.

    Returns: (new_path, action) where action is 'moved', 'skipped_dup', or 'renamed'
    """
    if src == dst:
        return dst, 'already_ok'

    if not src.exists():
        return dst, 'missing'

    if dst.exists():
        # Compare content
        if file_hash(src) == file_hash(dst):
            if not dry_run:
                src.unlink()
            return dst, 'skipped_dup'
        # Different content — append counter
        stem = dst.stem
        suffix = dst.suffix
        counter = 2
        while dst.exists():
            dst = dst.parent / f"{stem}_{counter}{suffix}"
            counter += 1

    if not dry_run:
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(src), str(dst))

    return dst, 'moved'


def extract_year_from_path(filepath):
    """Try to extract a 4-digit year from path components."""
    parts = Path(filepath).parts
    for part in parts:
        if re.match(r'^(20\d{2})$', part):
            return part
    return None


def reorganize_db_files(conn, dry_run=False, verbose=False):
    """Phase 1: Move DB-tracked files to {company}/{year}/{filename}."""
    cursor = conn.cursor()

    cursor.execute("""
        SELECT f.id, f.filepath, f.filename,
               d.doc_date, d.company_id,
               c.slug as company_slug
        FROM files f
        JOIN documents d ON d.file_id = f.id
        JOIN companies c ON d.company_id = c.id
    """)
    rows = cursor.fetchall()

    stats = {'moved': 0, 'already_ok': 0, 'skipped_dup': 0, 'missing': 0, 'error': 0}

    for row in rows:
        fid = row['id']
        old_rel = row['filepath']
        filename = row['filename']
        company_slug = row['company_slug']
        doc_date = row['doc_date']

        # Determine year
        year = None
        if doc_date and len(doc_date) >= 4:
            year = doc_date[:4]
        if not year:
            year = extract_year_from_path(old_rel)
        if not year:
            # No date — file belongs in company inbox until date is assigned
            new_rel = f"{company_slug}/inbox/{filename}"
        else:
            new_rel = f"{company_slug}/{year}/{filename}"

        # Handle collision with different filename at target
        old_abs = FILES_DIR / old_rel
        new_abs = FILES_DIR / new_rel

        if old_abs == new_abs:
            stats['already_ok'] += 1
            continue

        new_abs, action = safe_move(old_abs, new_abs, dry_run=dry_run)
        new_rel = str(new_abs.relative_to(FILES_DIR))

        if verbose or action != 'already_ok':
            print(f"  [{action:>11}] {old_rel} → {new_rel}")

        if action == 'missing':
            print(f"  WARNING: source file missing: {old_abs}")
            stats['missing'] += 1
            continue

        stats[action] = stats.get(action, 0) + 1

        # Update DB path
        if action in ('moved', 'skipped_dup') and not dry_run:
            cursor.execute("UPDATE files SET filepath = ? WHERE id = ?", (new_rel, fid))

    if not dry_run:
        conn.commit()

    return stats


def reorganize_extra_files(dry_run=False, verbose=False):
    """Phase 2: Flatten non-DB files out of subfolders.

    Moves non-DB files from type subfolders (fakturor/, fakturor-mail/, etc.)
    into the flat {company}/{year}/ structure. Skips CSVs (disposable after import)
    and inbox files.
    """
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    # Get all DB-tracked paths (after phase 1 updates)
    cursor.execute("SELECT filepath FROM files")
    db_paths = {row['filepath'] for row in cursor.fetchall()}
    conn.close()

    stats = {'moved': 0, 'already_ok': 0, 'skipped': 0}

    # Walk all files under FILES_DIR
    for dirpath, dirnames, filenames in os.walk(FILES_DIR):
        rel_dir = Path(dirpath).relative_to(FILES_DIR)

        for fname in filenames:
            abs_path = Path(dirpath) / fname
            rel_path = str(rel_dir / fname)

            # Skip DB file, CSVs, JSON metadata
            if fname == 'openvera.db' or fname.endswith('.csv') or fname == 'inbox.json':
                stats['skipped'] += 1
                continue

            # Skip files already tracked in DB (handled in phase 1)
            if rel_path in db_paths:
                continue

            # Skip inbox files
            parts = Path(rel_path).parts
            if parts[0] == 'inbox' or (len(parts) > 1 and parts[1] == 'inbox'):
                stats['skipped'] += 1
                continue

            # Determine company from first path component
            company = parts[0] if parts else None
            if not company:
                continue

            # Files already in correct flat structure: {company}/{year}/{file}
            if len(parts) == 3 and re.match(r'^20\d{2}$', parts[1]):
                stats['already_ok'] += 1
                continue

            # Flatten into year folder if possible
            year = extract_year_from_path(rel_path)
            if year:
                target_rel = f"{company}/{year}/{fname}"
            else:
                stats['skipped'] += 1
                continue

            target_abs = FILES_DIR / target_rel

            if abs_path == target_abs:
                stats['already_ok'] += 1
                continue

            target_abs, action = safe_move(abs_path, target_abs, dry_run=dry_run)
            new_rel = str(target_abs.relative_to(FILES_DIR))

            if verbose or action != 'already_ok':
                print(f"  [{action:>11}] {rel_path} → {new_rel}")

            stats[action] = stats.get(action, 0) + 1

    return stats


def cleanup_empty_dirs(dry_run=False, verbose=False):
    """Remove empty directories left after migration."""
    removed = 0
    for dirpath, dirnames, filenames in os.walk(FILES_DIR, topdown=False):
        if dirpath == str(FILES_DIR):
            continue
        if not filenames and not dirnames:
            rel = Path(dirpath).relative_to(FILES_DIR)
            if verbose:
                print(f"  [     rmdir] {rel}/")
            if not dry_run:
                os.rmdir(dirpath)
            removed += 1
    return removed


def main():
    parser = argparse.ArgumentParser(description='Reorganize openvera-data folder structure')
    parser.add_argument('--dry-run', action='store_true', help='Preview changes without moving files')
    parser.add_argument('--verbose', action='store_true', help='Show each file operation')
    args = parser.parse_args()

    if args.dry_run:
        print("=== DRY RUN — no changes will be made ===\n")

    print(f"FILES_DIR: {FILES_DIR}")
    print(f"DB_PATH:  {DB_PATH}\n")

    # Phase 1: DB-tracked files
    print("Phase 1: Reorganizing DB-tracked files...")
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    db_stats = reorganize_db_files(conn, dry_run=args.dry_run, verbose=args.verbose)
    conn.close()
    print(f"  Moved: {db_stats['moved']}, Already OK: {db_stats['already_ok']}, "
          f"Duplicates removed: {db_stats.get('skipped_dup', 0)}, Missing: {db_stats['missing']}")

    # Phase 2: Non-DB files
    print("\nPhase 2: Reorganizing non-DB files...")
    extra_stats = reorganize_extra_files(dry_run=args.dry_run, verbose=args.verbose)
    print(f"  Moved: {extra_stats['moved']}, Already OK: {extra_stats['already_ok']}, "
          f"Skipped: {extra_stats['skipped']}")

    # Phase 3: Cleanup empty dirs
    print("\nPhase 3: Cleaning up empty directories...")
    removed = cleanup_empty_dirs(dry_run=args.dry_run, verbose=args.verbose)
    print(f"  Removed: {removed} empty directories")

    print("\nDone!")


if __name__ == '__main__':
    main()
