#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Load/save Autokong config (steps, scope, schedule, audit, paths).
Config file is JSON; path can be overridden via AUTOKONG_CONFIG_PATH or default to data/config.json.
"""

import json
import os
from typing import Any, Dict

# Which .properties file to use for each pipeline step (filename only, in SongKong Prefs/)
DEFAULT_SONGKONG_FILES = {
    "musicbrainz": "songkong_fixsongs4.properties",
    "bandcamp": "songkong_bandcamp.properties",
    "delete_duplicates": "songkong_deleteduplicates.properties",
    "rename": "songkong_renamefiles.properties",
}

DEFAULT_CONFIG = {
    # Par défaut, on active MusicBrainz, Bandcamp, delete_duplicates et rename.
    # Les étapes historiques de "final clash cleanup / remove incomplete" restent
    # supprimées du script pour éviter les trous d'albums.
    "steps_enabled": [
        "musicbrainz",
        "bandcamp",
        "delete_duplicates",
        "rename",
    ],
    "scope": "daily",
    "schedule": {
        "enabled": False,
        "cron": "0 3 * * *",
        "preset": "nightly",
        "steps": None,
        "scope": None,
    },
    "audit_enabled": False,
    "paths": {},
    "songkong_files": dict(DEFAULT_SONGKONG_FILES),
}

CONFIG_KEYS = ("steps_enabled", "scope", "schedule", "audit_enabled", "paths", "songkong_files")


def get_config_path() -> str:
    return os.environ.get("AUTOKONG_CONFIG_PATH") or os.path.join(
        os.environ.get("AUTOKONG_DATA_DIR", "/app/data"),
        "config.json",
    )


def load_config() -> Dict[str, Any]:
    path = get_config_path()
    if not os.path.isfile(path):
        return dict(DEFAULT_CONFIG)
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        return dict(DEFAULT_CONFIG)
    for key in CONFIG_KEYS:
        if key not in data:
            data[key] = DEFAULT_CONFIG.get(key)
    return data


def save_config(config: Dict[str, Any]) -> None:
    path = get_config_path()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(config, f, indent=2, ensure_ascii=False)


def config_to_pipeline_overrides(config: Dict[str, Any]) -> Dict[str, Any]:
    """Convert config (paths, songkong, plex) to overrides for run_pipeline(config_overrides=)."""
    paths = config.get("paths") or {}
    overrides = {}
    if paths.get("dump_host_dir"):
        overrides["dump_host_dir"] = paths["dump_host_dir"]
    # Permettre plusieurs dossiers de départ (liste).
    if paths.get("dump_host_dirs"):
        overrides["dump_host_dirs"] = paths["dump_host_dirs"]
    if paths.get("host_root"):
        overrides["host_root"] = paths["host_root"]
    if paths.get("autoclean_root_dir"):
        overrides["autoclean_root_dir"] = paths["autoclean_root_dir"]
    if paths.get("autocheck_root_dir"):
        overrides["autocheck_root_dir"] = paths["autocheck_root_dir"]
    songkong_files = config.get("songkong_files") or DEFAULT_SONGKONG_FILES
    overrides["songkong_files"] = songkong_files
    if config.get("songkong_prefs_dir"):
        overrides["songkong_prefs_dir"] = config["songkong_prefs_dir"]
    # Always pass Plex settings from config (from DB) so runs use saved values
    if "plex_host" in config and config["plex_host"]:
        overrides["plex_host"] = str(config["plex_host"]).strip()
    if "plex_token" in config:
        overrides["plex_token"] = str(config["plex_token"]) if config["plex_token"] is not None else ""
    if "plex_library_section" in config and config["plex_library_section"] is not None:
        overrides["plex_library_section"] = str(config["plex_library_section"]).strip()
    if "plex_dump_path" in config and config["plex_dump_path"] is not None:
        overrides["plex_dump_path"] = str(config["plex_dump_path"]).strip()
    if "plex_matched_path" in config and config["plex_matched_path"] is not None:
        overrides["plex_matched_path"] = str(config["plex_matched_path"]).strip()
    if "plex_retry_interval" in config and config["plex_retry_interval"] is not None:
        try:
            overrides["plex_retry_interval"] = int(str(config["plex_retry_interval"]).strip())
        except ValueError:
            pass
    return overrides
