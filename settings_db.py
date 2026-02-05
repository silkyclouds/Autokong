#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Autokong settings stored in SQLite (settings.db). Replaces config.json for all user config.
Keys: steps_enabled, scope, audit_enabled, schedule, paths, songkong_prefs_dir, songkong_files,
      plex_host, plex_token, plex_library_section, plex_dump_path, plex_matched_path, plex_retry_interval.
"""

import json
import os
import sqlite3
from pathlib import Path
from typing import Any, Dict

_APP_DIR = Path(__file__).resolve().parent
DATA_DIR = os.environ.get("AUTOKONG_DATA_DIR", str(_APP_DIR / "data"))
SETTINGS_DB_PATH = os.path.join(DATA_DIR, "settings.db")

# Default SongKong .properties mapping
DEFAULT_SONGKONG_FILES = {
    "musicbrainz": "songkong_fixsongs4.properties",
    "bandcamp": "songkong_bandcamp.properties",
    "delete_duplicates": "songkong_deleteduplicates.properties",
    "rename": "songkong_renamefiles.properties",
}

# Default prefs dir: env or fixed path
def _default_songkong_prefs_dir() -> str:
    base = os.environ.get("SONGKONG_CONFIG_DIR", "/mnt/cache/appdata/songkong")
    return os.path.join(base, "Prefs")

DEFAULTS = {
    # Par défaut, toutes les étapes SongKong classiques sont activées
    # (dont delete_duplicates). Les vraies suppressions massives de fichiers
    # type "final clash cleanup / remove incomplete" restent retirées du code.
    "steps_enabled": json.dumps(["musicbrainz", "bandcamp", "delete_duplicates", "rename"]),
    "scope": "daily",
    "audit_enabled": "false",
    "schedule": json.dumps({
        "enabled": False,
        "cron": "0 3 * * *",
        "preset": "nightly",
        "steps": None,
        "scope": None,
    }),
    "paths": json.dumps({}),
    "songkong_prefs_dir": _default_songkong_prefs_dir(),
    "songkong_files": json.dumps(DEFAULT_SONGKONG_FILES),
    "plex_host": "http://192.168.3.2:32400",
    "plex_token": "",
    "plex_library_section": "1",
    "plex_dump_path": "/music/unmatched",
    "plex_matched_path": "/music/matched",
    "plex_retry_interval": "5",
}

VALID_SCOPES = ("daily", "monthly", "all_days")
VALID_STEPS = {
    "musicbrainz", "bandcamp", "delete_duplicates", "rename",
    "autoclean_empty", "plex_scans", "plex_trash",
}


def _init_schema(conn: sqlite3.Connection) -> None:
    conn.execute("""
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
    """)
    conn.commit()
    # Seed defaults for any missing key
    for key, value in DEFAULTS.items():
        row = conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
        if row is None:
            conn.execute("INSERT INTO settings (key, value) VALUES (?, ?)", (key, value))
    conn.commit()


def _get_conn() -> sqlite3.Connection:
    os.makedirs(os.path.dirname(SETTINGS_DB_PATH), exist_ok=True)
    conn = sqlite3.connect(SETTINGS_DB_PATH)
    _init_schema(conn)
    return conn


def get_setting(key: str) -> str | None:
    """Return raw value for key, or None if missing."""
    with _get_conn() as conn:
        row = conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
        return row[0] if row else None


def get_all_settings() -> Dict[str, Any]:
    """Return full config dict (same shape as old load_config()) for API and pipeline."""
    with _get_conn() as conn:
        rows = conn.execute("SELECT key, value FROM settings").fetchall()
    raw = dict(rows)
    schedule = json.loads(raw.get("schedule", DEFAULTS["schedule"]))
    paths = json.loads(raw.get("paths", DEFAULTS["paths"]))
    steps_enabled = json.loads(raw.get("steps_enabled", DEFAULTS["steps_enabled"]))
    songkong_files = json.loads(raw.get("songkong_files", DEFAULTS["songkong_files"]))
    return {
        "steps_enabled": steps_enabled,
        "scope": raw.get("scope", DEFAULTS["scope"]),
        "audit_enabled": raw.get("audit_enabled", DEFAULTS["audit_enabled"]).lower() == "true",
        "schedule": schedule,
        "paths": paths,
        "songkong_prefs_dir": raw.get("songkong_prefs_dir", DEFAULTS["songkong_prefs_dir"]),
        "songkong_files": songkong_files,
        "plex_host": raw.get("plex_host", DEFAULTS["plex_host"]),
        "plex_token": raw.get("plex_token", DEFAULTS["plex_token"]),
        "plex_library_section": raw.get("plex_library_section", DEFAULTS["plex_library_section"]),
        "plex_dump_path": raw.get("plex_dump_path", DEFAULTS["plex_dump_path"]),
        "plex_matched_path": raw.get("plex_matched_path", DEFAULTS["plex_matched_path"]),
        "plex_retry_interval": raw.get("plex_retry_interval", DEFAULTS["plex_retry_interval"]),
    }


def _validate(key: str, value: Any) -> None:
    """Raise ValueError if value is invalid for key."""
    if key == "scope":
        if value not in VALID_SCOPES:
            raise ValueError(f"scope must be one of {VALID_SCOPES}")
    elif key == "steps_enabled":
        if not isinstance(value, list):
            raise ValueError("steps_enabled must be a list")
        for s in value:
            if s not in VALID_STEPS:
                raise ValueError(f"invalid step: {s}")
    elif key == "audit_enabled":
        if not isinstance(value, bool):
            raise ValueError("audit_enabled must be boolean")
    elif key == "schedule":
        if not isinstance(value, dict):
            raise ValueError("schedule must be an object")
    elif key == "paths":
        if not isinstance(value, dict):
            raise ValueError("paths must be an object")
    elif key == "songkong_prefs_dir":
        if not isinstance(value, str) or not value.strip():
            raise ValueError("songkong_prefs_dir must be a non-empty path")
    elif key == "songkong_files":
        if not isinstance(value, dict):
            raise ValueError("songkong_files must be an object")
    elif key == "plex_host":
        if not isinstance(value, str) or not value.strip():
            raise ValueError("plex_host must be a non-empty URL")
        if not value.startswith("http://") and not value.startswith("https://"):
            raise ValueError("plex_host must be http or https URL")
    elif key == "plex_library_section":
        if not str(value).strip():
            raise ValueError("plex_library_section must be set")
        try:
            int(str(value).strip())
        except ValueError:
            raise ValueError("plex_library_section must be numeric")
    elif key == "plex_retry_interval":
        try:
            n = int(str(value).strip())
            if n < 1 or n > 60:
                raise ValueError("plex_retry_interval must be between 1 and 60")
        except ValueError as e:
            if "invalid literal" in str(e):
                raise ValueError("plex_retry_interval must be numeric")
            raise


def set_setting(key: str, value: Any) -> None:
    """Validate and persist one setting. Value can be dict/list (stored as JSON) or str/bool/int."""
    if key not in DEFAULTS:
        raise ValueError(f"unknown setting key: {key}")
    if isinstance(value, (dict, list)):
        value_str = json.dumps(value)
        _validate(key, value)
    elif isinstance(value, bool):
        value_str = "true" if value else "false"
        _validate(key, value)
    else:
        value_str = str(value) if value is not None else ""
        if key == "scope":
            _validate(key, value_str)
        elif key == "audit_enabled":
            _validate(key, value_str.lower() == "true")
        elif key in ("plex_host", "plex_token", "plex_dump_path", "plex_matched_path", "songkong_prefs_dir"):
            _validate(key, value_str)
        elif key == "plex_library_section":
            _validate(key, value_str)
        elif key == "plex_retry_interval":
            _validate(key, value_str)

    with _get_conn() as conn:
        conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", (key, value_str))
        conn.commit()


def set_settings(updates: Dict[str, Any]) -> None:
    """Validate and persist multiple settings."""
    for key, value in updates.items():
        if key in DEFAULTS:
            if isinstance(value, (dict, list)):
                value_str = json.dumps(value)
            elif isinstance(value, bool):
                value_str = "true" if value else "false"
            else:
                value_str = str(value) if value is not None else ""
            if key in ("steps_enabled", "schedule", "paths", "songkong_files"):
                _validate(key, json.loads(value_str))
            elif key == "audit_enabled":
                _validate(key, value_str.lower() == "true")
            elif key == "scope":
                _validate(key, value_str)
            elif key in ("plex_host", "plex_token", "plex_library_section", "plex_dump_path", "plex_matched_path", "plex_retry_interval", "songkong_prefs_dir"):
                _validate(key, value_str)

    with _get_conn() as conn:
        for key, value in updates.items():
            if key not in DEFAULTS:
                continue
            if isinstance(value, (dict, list)):
                value_str = json.dumps(value)
            elif isinstance(value, bool):
                value_str = "true" if value else "false"
            else:
                value_str = str(value) if value is not None else ""
            conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", (key, value_str))
        conn.commit()


def migrate_from_config_json() -> None:
    """If config.json exists, load it and populate settings.db then stop using it."""
    from config_manager import get_config_path, load_config
    path = get_config_path()
    if not os.path.isfile(path):
        return
    try:
        data = load_config()
    except Exception:
        return
    updates = {}
    if "steps_enabled" in data:
        updates["steps_enabled"] = data["steps_enabled"]
    if "scope" in data:
        updates["scope"] = data["scope"]
    if "audit_enabled" in data:
        updates["audit_enabled"] = data["audit_enabled"]
    if "schedule" in data:
        updates["schedule"] = data["schedule"]
    if "paths" in data:
        updates["paths"] = data["paths"]
    if "songkong_files" in data:
        updates["songkong_files"] = data["songkong_files"]
    if not updates:
        return
    with _get_conn() as conn:
        _init_schema(conn)
        for key, value in updates.items():
            if key == "steps_enabled":
                conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", (key, json.dumps(value)))
            elif key == "scope":
                conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", (key, value))
            elif key == "audit_enabled":
                conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", (key, "true" if value else "false"))
            elif key == "schedule":
                conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", (key, json.dumps(value)))
            elif key == "paths":
                conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", (key, json.dumps(value)))
            elif key == "songkong_files":
                conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", (key, json.dumps(value)))
        conn.commit()
