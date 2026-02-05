#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Pipeline audit: snapshot of folders/files/tags before and after a run, then compare to detect
changes and albums with "holes" (missing tracks).
"""

import os
from collections import defaultdict
from typing import Any, Dict, List, Optional, Set, Tuple

AUDIO_EXTENSIONS = (".mp3", ".flac", ".wav", ".aac", ".m4a", ".ogg", ".wma", ".alac", ".aiff")


def _read_file_tags(filepath: str) -> Dict[str, Any]:
    """Read audio tags; return dict with artist, album, title, track, etc. or empty on error."""
    try:
        from tinytag import TinyTag
    except ImportError:
        return {}
    try:
        tag = TinyTag.get(filepath)
        return {
            "artist": (tag.artist or "").strip() or None,
            "album": (tag.album or "").strip() or None,
            "title": (tag.title or "").strip() or None,
            "track": str(tag.track).split("/")[0].strip() if tag.track else None,
            "track_total": str(tag.track_total).strip() if tag.track_total else None,
            "albumartist": (tag.albumartist or "").strip() or None,
        }
    except Exception:
        return {}


def snapshot_zone(root_paths: List[str]) -> Dict[str, Any]:
    """
    Build a full snapshot of the given root paths: all directories and audio files with tags.
    Returns a dict: roots, files (list of {path, root, name, size, tags}).
    """
    result: Dict[str, Any] = {"roots": list(root_paths), "files": []}
    for root in root_paths:
        if not os.path.isdir(root):
            continue
        for dirpath, _dirnames, filenames in os.walk(root):
            for name in filenames:
                if not name.lower().endswith(AUDIO_EXTENSIONS):
                    continue
                full = os.path.join(dirpath, name)
                try:
                    size = os.path.getsize(full)
                except OSError:
                    size = 0
                rel = os.path.relpath(full, root)
                tags = _read_file_tags(full)
                result["files"].append({
                    "path": rel,
                    "root": root,
                    "full_path": full,
                    "name": name,
                    "size": size,
                    "tags": tags,
                })
    return result


def _album_key(f: Dict[str, Any]) -> Tuple[Optional[str], Optional[str]]:
    t = f.get("tags") or {}
    artist = t.get("artist") or t.get("albumartist") or ""
    album = t.get("album") or ""
    return (artist or None, album or None)


def _track_num(tags: Dict[str, Any]) -> Optional[int]:
    t = tags.get("track")
    if t is None:
        return None
    try:
        return int(str(t).strip())
    except (ValueError, TypeError):
        return None


def compare_snapshots(before: Dict[str, Any], after: Dict[str, Any]) -> Dict[str, Any]:
    """
    Compare before/after snapshots. Returns:
    - albums_changed: list of (artist, album) that have changes
    - files_deleted: list of {path, root, tags}
    - files_renamed_or_moved: list of {old_path, new_path, ...}
    - tags_changed: list of {path, field, old_val, new_val}
    - albums_with_holes: list of {artist, album, before_count, after_count, missing_tracks}
    """
    before_files = {(f["root"], f["path"]): f for f in before.get("files", [])}
    after_files = {(f["root"], f["path"]): f for f in after.get("files", [])}
    before_by_album: Dict[Tuple[Optional[str], Optional[str]], List[Dict]] = defaultdict(list)
    after_by_album: Dict[Tuple[Optional[str], Optional[str]], List[Dict]] = defaultdict(list)
    for f in before.get("files", []):
        before_by_album[_album_key(f)].append(f)
    for f in after.get("files", []):
        after_by_album[_album_key(f)].append(f)

    files_deleted: List[Dict[str, Any]] = []
    for key in before_files:
        if key not in after_files:
            files_deleted.append(before_files[key])
    files_added: List[Dict[str, Any]] = []
    for key in after_files:
        if key not in before_files:
            files_added.append(after_files[key])

    # Build a simple match by (root, size, artist, album, track) to detect renames/moves
    def file_id(f: Dict[str, Any]) -> Tuple[Any, ...]:
        t = f.get("tags") or {}
        return (f["root"], f["size"], t.get("artist"), t.get("album"), _track_num(t))

    before_by_id: Dict[Tuple, Dict] = {}
    for f in before.get("files", []):
        fid = file_id(f)
        if fid not in before_by_id:
            before_by_id[fid] = f
    after_by_id: Dict[Tuple, Dict] = {}
    for f in after.get("files", []):
        fid = file_id(f)
        if fid not in after_by_id:
            after_by_id[fid] = f

    files_renamed_or_moved: List[Dict[str, Any]] = []
    matched_after_keys: Set[Tuple[str, str]] = set()
    for fid, bf in before_by_id.items():
        if fid in after_by_id:
            af = after_by_id[fid]
            bpath = (bf["root"], bf["path"])
            apath = (af["root"], af["path"])
            if bpath != apath:
                files_renamed_or_moved.append({
                    "old_path": os.path.join(bf["root"], bf["path"]),
                    "new_path": os.path.join(af["root"], af["path"]),
                })
            matched_after_keys.add(apath)

    tags_changed: List[Dict[str, Any]] = []
    for key in before_files:
        if key not in after_files:
            continue
        bf, af = before_files[key], after_files[key]
        bt, at = bf.get("tags") or {}, af.get("tags") or {}
        for field in ("artist", "album", "title", "track"):
            if bt.get(field) != at.get(field):
                tags_changed.append({
                    "path": os.path.join(bf["root"], bf["path"]),
                    "field": field,
                    "old_val": bt.get(field),
                    "new_val": at.get(field),
                })

    albums_with_holes: List[Dict[str, Any]] = []
    all_albums = set(before_by_album) | set(after_by_album)
    for (artist, album) in all_albums:
        blist = before_by_album.get((artist, album), [])
        alist = after_by_album.get((artist, album), [])
        b_tracks = sorted({_track_num(f.get("tags") or {}) for f in blist} - {None})
        a_tracks = sorted({_track_num(f.get("tags") or {}) for f in alist} - {None})
        if not b_tracks:
            continue
        before_count = len(blist)
        after_count = len(alist)
        if after_count < before_count or (set(a_tracks) != set(b_tracks) and set(a_tracks) < set(b_tracks)):
            missing = set(b_tracks) - set(a_tracks)
            # Do not report as hole when missing track numbers reappear under same album, other artist (tag split)
            other_artist_tracks: Set[int] = set()
            for (oa, oal) in after_by_album:
                if oal == album and oa != artist:
                    for f in after_by_album[(oa, oal)]:
                        tn = _track_num(f.get("tags") or {})
                        if tn is not None:
                            other_artist_tracks.add(tn)
            if missing and missing <= other_artist_tracks:
                continue
            albums_with_holes.append({
                "artist": artist,
                "album": album,
                "before_count": before_count,
                "after_count": after_count,
                "missing_tracks": sorted(missing),
            })

    albums_changed_set: Set[Tuple[Optional[str], Optional[str]]] = set()
    for h in albums_with_holes:
        albums_changed_set.add((h["artist"], h["album"]))
    for f in files_deleted:
        albums_changed_set.add(_album_key(f))
    for f in files_added:
        albums_changed_set.add(_album_key(f))
    for tc in tags_changed:
        # Resolve album from path if needed; for simplicity we keep albums_changed from holes + deleted/added
        pass
    albums_changed = [{"artist": a, "album": b} for a, b in albums_changed_set]

    return {
        "albums_changed": albums_changed,
        "files_deleted": [{"path": os.path.join(f["root"], f["path"]), "tags": f.get("tags")} for f in files_deleted],
        "files_added": [{"path": os.path.join(f["root"], f["path"]), "tags": f.get("tags")} for f in files_added],
        "files_renamed_or_moved": files_renamed_or_moved,
        "tags_changed": tags_changed,
        "albums_with_holes": albums_with_holes,
        "summary": {
            "files_deleted_count": len(files_deleted),
            "files_added_count": len(files_added),
            "files_renamed_or_moved_count": len(files_renamed_or_moved),
            "tags_changed_count": len(tags_changed),
            "albums_with_holes_count": len(albums_with_holes),
        },
    }
