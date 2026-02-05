#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Verify albums with holes (missing track numbers) on a given folder.
Run on the server (e.g. Unraid) where the music paths exist.

Usage:
  python3 verify_album_holes.py /mnt/downloads_cache/MURRAY/Music/Music_dump/02-2025/03-02
  python3 verify_album_holes.py /path/to/03-02 --limit 5
  python3 verify_album_holes.py /path/to/03-02 --artist "Four Tet"

Requires: tinytag (pip install tinytag)
"""

import argparse
import os
import sys
from collections import defaultdict
from typing import Any, Dict, List, Optional, Set, Tuple

# Reuse same extensions as pipeline_audit
AUDIO_EXTENSIONS = (".mp3", ".flac", ".wav", ".aac", ".m4a", ".ogg", ".wma", ".alac", ".aiff")


def _read_file_tags(filepath: str) -> Dict[str, Any]:
    try:
        from tinytag import TinyTag
    except ImportError:
        return {}
    try:
        tag = TinyTag.get(filepath)
        return {
            "artist": (tag.artist or "").strip() or None,
            "album": (tag.album or "").strip() or None,
            "albumartist": (getattr(tag, "albumartist", None) or "").strip() or None,
            "title": (tag.title or "").strip() or None,
            "track": str(tag.track).split("/")[0].strip() if tag.track else None,
            "track_total": str(tag.track_total).strip() if tag.track_total else None,
        }
    except Exception:
        return {}


def _album_key(tags: Dict[str, Any]) -> Tuple[Optional[str], Optional[str]]:
    """Same as pipeline_audit: artist or albumartist, album."""
    artist = tags.get("artist") or tags.get("albumartist") or ""
    album = tags.get("album") or ""
    return (artist or None, album or None)


def _track_num(tags: Dict[str, Any]) -> Optional[int]:
    t = tags.get("track")
    if t is None:
        return None
    try:
        return int(str(t).strip())
    except (ValueError, TypeError):
        return None


def scan_folder(root_path: str) -> List[Dict[str, Any]]:
    """Return list of {path, name, tags} for all audio files under root_path."""
    files = []
    if not os.path.isdir(root_path):
        return files
    for dirpath, _dirnames, filenames in os.walk(root_path):
        for name in filenames:
            if not name.lower().endswith(AUDIO_EXTENSIONS):
                continue
            full = os.path.join(dirpath, name)
            rel = os.path.relpath(full, root_path)
            tags = _read_file_tags(full)
            files.append({"path": rel, "name": name, "tags": tags})
    return files


def main() -> None:
    parser = argparse.ArgumentParser(description="List albums and detect holes (missing track numbers) in a folder.")
    parser.add_argument("folder", nargs="+", help="Folder path(s) to scan (e.g. .../03-02)")
    parser.add_argument("--limit", type=int, default=0, help="Max number of albums to show (0 = all)")
    parser.add_argument("--artist", type=str, default="", help="Filter by artist name (substring)")
    parser.add_argument("--album", type=str, default="", help="Filter by album name (substring)")
    parser.add_argument("--verbose", "-v", action="store_true", help="Print each file with its track tag")
    args = parser.parse_args()

    all_files: List[Dict[str, Any]] = []
    for folder in args.folder:
        if not os.path.isdir(folder):
            print(f"Not a directory: {folder}", file=sys.stderr)
            continue
        all_files.extend(scan_folder(folder))

    if not all_files:
        print("No audio files found.")
        return

    by_album: Dict[Tuple[Optional[str], Optional[str]], List[Dict]] = defaultdict(list)
    for f in all_files:
        key = _album_key(f.get("tags") or {})
        by_album[key].append(f)

    artist_filter = args.artist.strip().lower()
    album_filter = args.album.strip().lower()

    albums_with_holes: List[Tuple[Tuple[Optional[str], Optional[str]], Set[int], int, Optional[int], List[Dict]]] = []
    for (artist, album), flist in sorted(by_album.items(), key=lambda x: (str(x[0][0]), str(x[0][1]))):
        if artist_filter and (artist or "").lower().find(artist_filter) < 0:
            continue
        if album_filter and (album or "").lower().find(album_filter) < 0:
            continue
        track_nums = {_track_num(f.get("tags") or {}) for f in flist} - {None}
        track_totals = [int(t) for t in {str((f.get("tags") or {}).get("track_total", "")).strip() for f in flist} if t.isdigit()]
        track_total = max(track_totals) if track_totals else None
        expected = set(range(1, (track_total or 0) + 1)) if track_total else set()
        missing = expected - track_nums if expected else set()
        if missing or (track_total and len(track_nums) < track_total):
            albums_with_holes.append(((artist, album), track_nums, len(flist), track_total, flist))
            if args.limit and len(albums_with_holes) >= args.limit:
                break

    print(f"Scanned {len(all_files)} file(s), {len(by_album)} album(s).")
    print(f"Albums with holes (missing track numbers): {len(albums_with_holes)}\n")

    for (artist, album), present, count, total, flist in albums_with_holes:
        missing = (set(range(1, (total or 0) + 1)) - present) if total else set()
        missing_sorted = sorted(missing)
        print(f"{artist} – {album}")
        print(f"  Files: {count}, track_total in tags: {total or '?'}, present tracks: {sorted(present)}")
        if missing_sorted:
            print(f"  Missing track numbers: {missing_sorted}")
        if args.verbose:
            for f in flist:
                t = _track_num(f.get("tags") or {})
                print(f"    {f['path']} -> track={t}")
        print()

    if not albums_with_holes:
        print("No albums with holes detected (by track number / track_total).")


if __name__ == "__main__":
    main()
