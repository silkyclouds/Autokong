#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Autokong Nightly Process – Full functional script with Plex polling, correct path encoding,
SQLite state persistence, per-daily-folder SongKong scans (up to yesterday only),
automatic Reports/images creation, plus Plex rescans on both dump & matched folders.
============================================================================================
1) SongKong (4 passes) per daily folder (only days < today)
2) Clean empty album folders
3) Remove incomplete albums
4) Plex scans on both dump and matched folders with polling
5) Empty Plex trash
6) Pushover / Discord / email notifications
7) SQLite db (autokong.db) tracks processed folders to avoid re-scans
"""

import os
import re
import shutil
import sqlite3
import subprocess
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
from email.message import EmailMessage
from typing import Callable, List, Optional
from urllib.parse import quote

# Optional log callback for streaming logs (e.g. to WebUI). Set by run_pipeline().
_log_callback: Optional[Callable[[str], None]] = None
# Optional progress callback: (current_index, total, step_id, step_label, container_name, folder).
_progress_callback: Optional[Callable[..., None]] = None
# Optional container log callback for streaming Docker container stdout (e.g. SongKong output).
_container_log_callback: Optional[Callable[[str], None]] = None

STEP_LABELS = {
    "musicbrainz": "MusicBrainz / Fix songs",
    "bandcamp": "Bandcamp",
    "delete_duplicates": "Delete duplicates",
    "rename": "Rename files",
    "autoclean_empty": "Auto-clean empty folders",
    "plex_scans": "Plex scans",
    "plex_trash": "Plex trash",
}

import requests

# -----------------------------------------------------------------------------
# 1) GLOBAL CONFIGURATION
# -----------------------------------------------------------------------------
YESTERDAY            = datetime.now() - timedelta(days=1)
MONTH_YEAR           = YESTERDAY.strftime("%m-%Y")            # "05-2025"
DUMP_HOST_DIR        = f"/mnt/downloads_cache/MURRAY/Music/Music_dump/{MONTH_YEAR}/"
MATCHED_HOST_DIR     = "/mnt/downloads_cache/MURRAY/Music/Music_matched"

SONGKONG_IMAGE       = "songkong/songkong"

# Host/Container roots for consistent path mapping
HOST_ROOT            = "/mnt/downloads_cache/MURRAY/Music"
CONTAINER_ROOT       = "/music"

PUSHOVER_USER_KEY    = "u8pztbghz47d689h8nwsctga1jp7z1"
PUSHOVER_API_TOKEN   = "ajnkq8s9f9ggwg5ooyq9zppxi2z2is"
DISCORD_WEBHOOK      = "https://discord.com/api/webhooks/1270305634939830449/l1woj5TTffyv489Bx0HIKco6Vu6-IjKRZ2nbljgqMB27Mv4iEQpLKprlQsX8aQw1qVin"

PLEX_HOST            = "http://192.168.3.2:32401"
PLEX_TOKEN           = "-Axp7JjSoCuNQBHGEBnh"
PLEX_LIBRARY_SECTION = 1
PLEX_DUMP_PATH       = "/music/unmatched"
PLEX_MATCHED_PATH    = "/music/matched"
PLEX_RETRY_INTERVAL  = 5
DAYS_THRESHOLD       = 5
# Runtime overrides from run_pipeline(config_overrides) for Plex; set at start of run, cleared in finally
_plex_overrides: dict = {}

AUTOCLEAN_ROOT_DIR   = "/mnt/downloads_cache/MURRAY/Music/Music_dump"
AUTOCHECK_ROOT_DIR   = "/mnt/downloads_cache/MURRAY/Music/Music_matched"
DB_PATH              = "autokong.db"
LOG_FILE             = "action_log.txt"

SEND_EMAIL_REPORT    = False
EMAIL_SENDER         = "vous@exemple.com"
EMAIL_RECIPIENT      = "dest@exemple.com"
EMAIL_HOST           = "smtp.votreserveur.com"
EMAIL_PORT           = 587
EMAIL_USERNAME       = "login"
EMAIL_PASSWORD       = "motdepasse"

# -----------------------------------------------------------------------------
# 2) UTILITIES & SQLITE STATE
# -----------------------------------------------------------------------------
past_processing_times: List[float] = []

# Persistent state file for already-processed folders
STATE_FILE = "/mnt/cache/appdata/scripts/processed_folders.log"
os.makedirs(os.path.dirname(STATE_FILE), exist_ok=True)
if not os.path.exists(STATE_FILE):
    with open(STATE_FILE, "w", encoding="utf-8"):
        pass

def log_action(msg: str) -> None:
    ts = f"{datetime.now()} - {msg}"
    print(ts, flush=True)
    with open(LOG_FILE, "a", encoding="utf-8") as fp:
        fp.write(ts + "\n")
    if _log_callback:
        try:
            _log_callback(ts)
        except Exception:
            pass

def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("""
        CREATE TABLE IF NOT EXISTS processed (
            folder TEXT UNIQUE,
            last_scanned TIMESTAMP,
            status TEXT
        )
    """)
    conn.commit()
    conn.close()

def was_processed(folder: str) -> bool:
    # Check persistent log file for folder
    try:
        with open(STATE_FILE, "r", encoding="utf-8") as f:
            for line in f:
                if line.rstrip("\n") == folder:
                    return True
    except Exception:
        pass
    # Also check sqlite for backward compatibility
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT status FROM processed WHERE folder = ?", (folder,))
    row = c.fetchone()
    conn.close()
    return bool(row and row[0] == "ok")

def mark_processed(folder: str, status: str = "ok"):
    # Write to persistent log file
    try:
        with open(STATE_FILE, "a", encoding="utf-8") as f:
            f.write(folder + "\n")
    except Exception as e:
        log_action(f"Error writing to STATE_FILE: {e}")
    # Also update sqlite for backward compatibility
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    now = datetime.now().isoformat()
    c.execute("""
        INSERT INTO processed(folder, last_scanned, status)
        VALUES(?, ?, ?)
        ON CONFLICT(folder) DO UPDATE SET
            last_scanned=excluded.last_scanned,
            status=excluded.status
    """, (folder, now, status))
    conn.commit()
    conn.close()


init_db()

# -----------------------------------------------------------------------------
# PATH MAPPING HELPERS (host <-> container)
# -----------------------------------------------------------------------------

def to_container_path(host_path: str) -> str:
    """Translate an absolute host path under HOST_ROOT to its container path.
    Example: /mnt/downloads_cache/MURRAY/Music/Music_dump/05-2025/01-foo
             -> /music/Music_dump/05-2025/01-foo
    """
    if not host_path.startswith(HOST_ROOT):
        raise ValueError(f"Host path outside HOST_ROOT: {host_path}")
    rel = os.path.relpath(host_path, HOST_ROOT).replace(os.sep, "/")
    return (f"{CONTAINER_ROOT}/{rel}").rstrip("/")


def to_host_path(container_path: str) -> str:
    """Translate a container path under CONTAINER_ROOT back to host.
    Example: /music/Artist/Album -> /mnt/downloads_cache/MURRAY/Music/Artist/Album
    """
    if not container_path.startswith(CONTAINER_ROOT):
        raise ValueError(f"Container path outside CONTAINER_ROOT: {container_path}")
    rel = container_path[len(CONTAINER_ROOT):].lstrip("/")
    return os.path.join(HOST_ROOT, rel)

def send_discord(msg: str) -> None:
    log_action("→ Sending Discord")
    r = requests.post(DISCORD_WEBHOOK, json={"content": msg}, timeout=10)
    if r.status_code not in (200, 204):
        log_action(f"Discord error {r.status_code}: {r.text}")

    log_action("→ Sending Pushover")
    requests.post(
        "https://api.pushover.net/1/messages.json",
        data={"token": PUSHOVER_API_TOKEN, "user": PUSHOVER_USER_KEY, "message": msg},
        timeout=10,
    )
    send_discord(msg)

def send_email_report(path: str, subject: str) -> None:
    if not SEND_EMAIL_REPORT:
        return
    html = open(path, "r", encoding="utf-8").read()
    msg = EmailMessage()
    msg["From"], msg["To"], msg["Subject"] = EMAIL_SENDER, EMAIL_RECIPIENT, subject
    msg.set_content("Report attached")
    msg.add_alternative(html, subtype="html")
    import smtplib
    with smtplib.SMTP(EMAIL_HOST, EMAIL_PORT) as srv:
        srv.starttls()
        srv.login(EMAIL_USERNAME, EMAIL_PASSWORD)
        srv.send_message(msg)
    log_action("Email report sent")

def calculate_eta(start: datetime) -> str:
    if not past_processing_times:
        return "Unknown"
    avg = sum(past_processing_times) / len(past_processing_times)
    rem = max(0, avg - (datetime.now() - start).total_seconds())
    return str(timedelta(seconds=int(rem)))

def get_progress_summary(done: int, total: int) -> str:
    pct = (done / total * 100) if total else 0
    return f"📊 Processed {done}/{total} ({pct:.2f}%)"

def has_music(path: str) -> bool:
    exts = (".mp3", ".flac", ".wav", ".aac", ".m4a", ".ogg", ".wma", ".alac", ".aiff")
    for _, _, files in os.walk(path):
        if any(f.lower().endswith(exts) for f in files):
            return True
    return False

def move_logs_to_backup(folder: str, ts: datetime) -> None:
    src = "/mnt/cache/appdata/songkong/Logs/"
    dst = "/mnt/cache/appdata/songkong/Logs_backup/"
    if not os.path.isdir(src):
        log_action(f"ℹ️ No logs to backup (src missing: {src})")
        return
    os.makedirs(dst, exist_ok=True)
    suffix = ts.strftime("%Y%m%d_%H%M%S")
    for f in os.listdir(src):
        shutil.move(
            os.path.join(src, f),
            os.path.join(dst, f"{folder.replace('/', '-')}_{suffix}_{f}")
        )

# -----------------------------------------------------------------------------
# 3) SONGKONG PHASE (4 passes) per daily folder
# -----------------------------------------------------------------------------
def clean_songkong_dirs() -> None:
    for p in (
        "/mnt/cache/appdata/songkong/Prefs/Database",
        "/mnt/cache/appdata/songkong/Logs",
        "/mnt/cache/appdata/songkong/Reports",
    ):
        shutil.rmtree(p, ignore_errors=True)
        log_action(f"Removed {p}")
    os.makedirs("/mnt/cache/appdata/songkong/Prefs/Database", exist_ok=True)
    os.makedirs("/mnt/cache/appdata/songkong/Logs", exist_ok=True)
    os.makedirs("/mnt/cache/appdata/songkong/Reports/images", exist_ok=True)
    log_action("Recreated Prefs/Database, Logs and Reports/images")

# SongKong CLI flags used by this pipeline (see SongKong docs: -m, -d, -f, -p, -o):
#   -m  fix songs in specified files (MusicBrainz / Fix Songs)
#   -e  (Bandcamp / edit – profile-specific)
#   -d  delete duplicates in specified files
#   -f  rename or move files
#   -p  profile (name of .properties file in Prefs, e.g. songkong_fixsongs4.properties)
#   -o  override options (e.g. musicbrainzOrDiscogsId=url for -c match one album)
#   -c  match one album (requires -o musicbrainzOrDiscogsId=...)
def run_songkong_task(folder: str, props: str, name: str, flag: str) -> None:
    start = datetime.now()
    cname = f"songkong_{name}_{os.path.basename(folder)}"
    container_folder = to_container_path(folder)

    cmd = [
        "docker", "run", "--rm", "--name", cname,
        "-v", f"{HOST_ROOT}:{CONTAINER_ROOT}",
        "-v", "/mnt/cache/appdata/songkong:/songkong",
        SONGKONG_IMAGE,
        flag, container_folder,
        "-p", props,
    ]

    retry = 0
    db_err = "Database /songkong/Prefs/Database appears corrupt"
    output: List[str] = []
    while retry < 3:
        log_action(f"SongKong {name}: {' '.join(cmd)}")
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        corrupt = False
        for line in proc.stdout:
            stripped = line.strip()
            output.append(stripped)
            if _container_log_callback:
                try:
                    _container_log_callback(stripped)
                except Exception:
                    pass
            if db_err in line:
                corrupt = True
                proc.terminate()
                log_action("DB corrupt → retry")
                shutil.rmtree("/mnt/cache/appdata/songkong/Prefs/Database", ignore_errors=True)
                retry += 1
                break
        if not corrupt:
            break

    duration = (datetime.now() - start).total_seconds()
    past_processing_times.append(duration)

    # Use "Songs loaded" or "Completed" as denominator; SongKong may output cumulative totals
    # for some keys (e.g. Fingerprinted) so n can exceed total_loaded -> show % only when n <= total
    total_loaded = next((int(m.group(1)) for l in output if (m := re.search(r"Songs loaded:(\d+)", l))), 0)
    completed = next((int(m.group(1)) for l in output if (m := re.search(r"Completed[: ](\d+)", l))), total_loaded)
    denominator = completed or total_loaded or 1
    summary_lines = []
    for key in ["Fingerprinted", "MusicBrainz", "Discogs", "Saved", "Completed", "Errors and Warnings"]:
        n = sum(int(m.group(1)) for l in output if (m := re.search(fr"{key}[: ](\d+)", l)))
        if n <= denominator and denominator > 0:
            pct = (n / denominator) * 100
            summary_lines.append(f"{key}: {n} ({pct:.2f}%)")
        else:
            summary_lines.append(f"{key}: {n}")

    notif = (
        f"SongKong {name.capitalize()} for `{folder}`: "
        + "; ".join(summary_lines)
        + f"; Duration: {timedelta(seconds=int(duration))}"
    )
    log_action(notif)

    rpt = find_report_path(name)
    if rpt:
        send_email_report(rpt, f"SongKong {name} report")
    move_logs_to_backup(folder, datetime.now())

def extract_delete_duplicates_summary(out: str) -> str:
    return "\n".join(re.findall(
        r"(Processing:\d+|Songs loaded:\d+|Duplicate groups found[: ]\d+|Duplicate songs deleted:\d+|Errors and Warnings:\d+)",
        out
    ))

def run_delete_duplicates(folder: str, props: str) -> str:
    # Ensure we work with a host path under HOST_ROOT
    if not folder.startswith(HOST_ROOT):
        raise ValueError(f"run_delete_duplicates() expects a host path under HOST_ROOT, got: {folder}")
    container_folder = to_container_path(folder)

    cmd = [
        "docker", "run", "--rm", "--name", f"songkong_delete_{os.path.basename(folder)}",
        "-v", f"{HOST_ROOT}:{CONTAINER_ROOT}",
        "-v", "/mnt/cache/appdata/songkong:/songkong",
        SONGKONG_IMAGE, "-d", container_folder, "-p", props,
    ]
    time.sleep(60)
    log_action("Delete dups: " + " ".join(cmd))
    out, _ = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True).communicate()
    if _container_log_callback and out:
        for ln in out.splitlines():
            try:
                _container_log_callback(ln)
            except Exception:
                pass
    return extract_delete_duplicates_summary(out)

def extract_rename_summary(out: str) -> str:
    return "\n".join(re.findall(
        r"(Report Created:.*|Songs loaded:\d+|Songs renamed:\d+|Completed:\d+|Errors and Warnings:\d+)",
        out
    ))

def run_rename_phase(
    folder: str,
    rename_props: str = "songkong_renamefiles.properties",
) -> None:
    # Ensure we work with a host path under HOST_ROOT
    if not folder.startswith(HOST_ROOT):
        raise ValueError(f"run_rename_phase() expects a path under HOST_ROOT, got: {folder}")
    container_folder = to_container_path(folder)

    cmd = [
        "docker", "run", "--rm", "--name", f"songkong_rename_{os.path.basename(folder)}",
        "-v", f"{HOST_ROOT}:{CONTAINER_ROOT}",
        "-v", "/mnt/cache/appdata/songkong:/songkong",
        SONGKONG_IMAGE, "-f", container_folder, "-p", rename_props,
    ]
    time.sleep(60)
    log_action("Rename: " + " ".join(cmd))
    out, _ = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True).communicate()
    if _container_log_callback and out:
        for ln in out.splitlines():
            try:
                _container_log_callback(ln)
            except Exception:
                pass
    log_action(f"Rename for `{folder}`: {extract_rename_summary(out)}")

def find_report_path(task: str) -> str | None:
    base = "/mnt/cache/appdata/songkong/Reports/"
    if not os.path.isdir(base):
        return None
    dirs = [os.path.join(base, d) for d in os.listdir(base) if task.lower() in d.lower()]
    if not dirs:
        return None
    latest = max(dirs, key=os.path.getmtime)
    for f in os.listdir(latest):
        if f.endswith(".html"):
            return os.path.join(latest, f)
    return None

# -----------------------------------------------------------------------------
# 7) AUTOCLEAN EMPTY ALBUM DIRS
# -----------------------------------------------------------------------------
def autoclean_empty_dirs(root: str) -> int:
    count = 0
    exts = (".mp3", ".flac", ".wav", ".aac", ".m4a", ".ogg", ".wma", ".alac", ".aiff")
    for dp, dirs, files in os.walk(root, topdown=False):
        rel = os.path.relpath(dp, root)
        parts = rel.split(os.sep) if rel != "." else []
        if len(parts) < 3:
            continue
        if not any(f.lower().endswith(exts) for f in files):
            shutil.rmtree(dp)
            log_action(f"Removed empty: {dp}")
            count += 1
    return count

# -----------------------------------------------------------------------------
# 8) PLEX REFRESH & EMPTY TRASH (use _plex_overrides from run_pipeline when set)
# -----------------------------------------------------------------------------
def _plex_host() -> str:
    return _plex_overrides.get("plex_host") or PLEX_HOST

def _plex_token() -> str:
    return _plex_overrides.get("plex_token") or PLEX_TOKEN

def _plex_library_section() -> str:
    return str(_plex_overrides.get("plex_library_section") or PLEX_LIBRARY_SECTION)

def _plex_retry_interval() -> int:
    return int(_plex_overrides.get("plex_retry_interval") or PLEX_RETRY_INTERVAL)

def plex_refresh_folder(path: str) -> bool:
    enc = quote(path, safe="/")
    url = f"{_plex_host()}/library/sections/{_plex_library_section()}/refresh?path={enc}"
    headers = {"X-Plex-Token": _plex_token()}
    for attempt in range(1, 4):
        try:
            r = requests.get(url, headers=headers, timeout=30)
            if r.status_code == 200:
                log_action(f"✔ Plex accepted refresh for {path}")
                return True
            log_action(f"✘ Plex returned {r.status_code} on attempt {attempt} for {path}")
        except Exception as e:
            log_action(f"✘ Plex exception on attempt {attempt} for {path}: {e}")
        time.sleep(_plex_retry_interval())
    log_action(f"⚠️ Giving up Plex refresh for {path}")
    return False

def is_scanning() -> bool:
    r = requests.get(f"{_plex_host()}/library/sections/{_plex_library_section()}",
                     headers={"X-Plex-Token": _plex_token()}, timeout=10)
    tree = ET.fromstring(r.content)
    return tree.attrib.get("refreshing") == "1"

def wait_for_scan_to_finish(poll_interval: int = 5) -> None:
    log_action("→ Waiting for Plex to finish scanning")
    while is_scanning():
        log_action(f"… still scanning, sleeping {poll_interval}s")
        time.sleep(poll_interval)
    log_action("✔ Plex scanning complete")

def _plex_dump_path() -> str:
    return _plex_overrides.get("plex_dump_path") or PLEX_DUMP_PATH

def _plex_matched_path() -> str:
    return _plex_overrides.get("plex_matched_path") or PLEX_MATCHED_PATH

def build_dump_path(folder_path: str) -> str:
    rel = os.path.relpath(folder_path, DUMP_HOST_DIR).replace(os.sep, "/")
    return f"{_plex_dump_path()}/{MONTH_YEAR}/{rel}"

def build_matched_path(folder_path: str) -> str:
    rel = os.path.relpath(folder_path, MATCHED_HOST_DIR).replace(os.sep, "/")
    return f"{_plex_matched_path()}/{rel}"

def plex_empty_trash() -> bool:
    url = f"{_plex_host()}/library/sections/{_plex_library_section()}/emptyTrash"
    headers = {"X-Plex-Token": _plex_token()}
    try:
        r = requests.put(url, headers=headers, timeout=30)
        if r.status_code in (200, 204):
            log_action("✔ Plex trash emptied")
            return True
        log_action(f"✘ Plex emptyTrash returned {r.status_code}: {r.text}")
    except Exception as e:
        log_action(f"✘ Exception during Plex emptyTrash: {e}")
    return False

# -----------------------------------------------------------------------------
# 10) FOLDERS TO PROCESS (scope) & PIPELINE ENTRY POINT
# -----------------------------------------------------------------------------
def get_folders_to_process(
    scope: str,
    dump_host_dir: Optional[str] = None,
) -> List[str]:
    """Return list of folder paths to process according to scope (daily | monthly | all_days)."""
    base = dump_host_dir or DUMP_HOST_DIR
    if not os.path.isdir(base):
        return []
    today = datetime.now().day
    if scope == "monthly":
        return [base.rstrip(os.sep)]
    # List subdirs that look like daily folders (DD-something)
    subdirs = [
        d for d in os.listdir(base)
        if os.path.isdir(os.path.join(base, d)) and d.split("-", 1)[0].isdigit()
    ]
    if scope == "daily":
        subdirs = [d for d in subdirs if int(d.split("-", 1)[0]) < today]
    # all_days: keep all
    return sorted([os.path.join(base, d) for d in subdirs])


def _normalize_dump_bases(config: dict) -> List[str]:
    """Derive a list of dump base directories from config overrides.

    Supports:
    - single string in config['dump_host_dir']
    - list in config['dump_host_dir']
    - optional extra list in config['dump_host_dirs']
    Falls back to the default DUMP_HOST_DIR if nothing is provided.
    """
    bases: List[str] = []
    raw = config.get("dump_host_dir") or DUMP_HOST_DIR
    extra = config.get("dump_host_dirs") or []
    if isinstance(raw, str) and raw.strip():
        bases.append(raw)
    elif isinstance(raw, list):
        bases.extend([b for b in raw if isinstance(b, str) and b.strip()])
    if isinstance(extra, list):
        bases.extend([b for b in extra if isinstance(b, str) and b.strip()])
    # Deduplicate while preserving order
    seen = set()
    uniq: List[str] = []
    for b in bases:
        if b not in seen:
            uniq.append(b)
            seen.add(b)
    return uniq or [DUMP_HOST_DIR]


# Step names that run per folder vs once at end
STEPS_PER_FOLDER = ("musicbrainz", "bandcamp", "delete_duplicates", "rename")
STEPS_GLOBAL = ("autoclean_empty", "plex_scans", "plex_trash")


def run_pipeline(
    steps: List[str],
    scope: str,
    log_callback: Optional[Callable[[str], None]] = None,
    enable_audit: bool = False,
    config_overrides: Optional[dict] = None,
    progress_callback: Optional[Callable[..., None]] = None,
    container_log_callback: Optional[Callable[[str], None]] = None,
) -> dict:
    """
    Run the Autokong pipeline with selected steps and scope.
    config_overrides can provide dump_host_dir, host_root, etc. for paths.
    progress_callback(current_index, total, step_id, step_label, container_name, folder) is called at each step start.
    container_log_callback(line) receives Docker container stdout lines.
    Returns a summary dict with status, steps_run, duration, and optionally audit_report if enable_audit.
    """
    global _log_callback, _progress_callback, _container_log_callback
    _log_callback = log_callback
    _progress_callback = progress_callback
    _container_log_callback = container_log_callback
    start_time = datetime.now()
    summary = {"status": "ok", "steps_run": [], "duration_seconds": 0, "error": None, "audit_report": None}
    config = config_overrides or {}
    global _plex_overrides
    _plex_overrides = {k: v for k, v in config.items() if k.startswith("plex_")}
    dump_bases = _normalize_dump_bases(config)
    host_root = config.get("host_root") or HOST_ROOT
    autoclean_root = config.get("autoclean_root_dir") or AUTOCLEAN_ROOT_DIR
    autocheck_root = config.get("autocheck_root_dir") or AUTOCHECK_ROOT_DIR
    songkong_files = config.get("songkong_files") or {}
    props_musicbrainz = songkong_files.get("musicbrainz") or "songkong_fixsongs4.properties"
    props_bandcamp = songkong_files.get("bandcamp") or "songkong_bandcamp.properties"
    props_delete_duplicates = songkong_files.get("delete_duplicates") or "songkong_deleteduplicates.properties"
    props_rename = songkong_files.get("rename") or "songkong_renamefiles.properties"

    try:
        folders = None
        if isinstance(config.get("folders"), list) and config["folders"]:
            folders = config["folders"]
        else:
            # Agrège les dossiers à traiter depuis chacun des dossiers de départ
            folders = []
            for base in dump_bases:
                folders.extend(get_folders_to_process(scope, base))
        if not folders:
            log_action(f"No folders to process for scope={scope} on {dump_host_dir}")
            summary["status"] = "no_folders"
            return summary

        log_action(f"=== Pipeline started: scope={scope}, {len(folders)} folder(s) ===")
        per_folder_steps = [s for s in STEPS_PER_FOLDER if s in steps]
        global_steps = [s for s in STEPS_GLOBAL if s in steps]
        total_work = len(folders) * len(per_folder_steps) + len(global_steps)

        def _report(current: int, step_id: str, container_name: Optional[str], folder_path: Optional[str]) -> None:
            if _progress_callback:
                try:
                    _progress_callback(
                        current, total_work, step_id, STEP_LABELS.get(step_id, step_id),
                        container_name or "", folder_path or "",
                    )
                except Exception:
                    pass

        work_index = 0
        if enable_audit:
            try:
                from pipeline_audit import snapshot_zone
                snapshot_before = snapshot_zone(folders)
                summary["_snapshot_before"] = snapshot_before
            except Exception as e:
                log_action(f"Audit snapshot before failed: {e}")
                summary["_snapshot_before"] = None

        for idx, folder in enumerate(folders, 1):
            if was_processed(folder) and scope == "daily":
                log_action(f"→ Skipping already processed: {folder}")
                continue
            try:
                if "musicbrainz" in steps:
                    _report(work_index, "musicbrainz", f"songkong_musicbrainz_{os.path.basename(folder)}", folder)
                    work_index += 1
                    clean_songkong_dirs()
                    run_songkong_task(folder, props_musicbrainz, "musicbrainz", "-m")
                    summary["steps_run"].append(f"musicbrainz:{folder}")
                if "bandcamp" in steps:
                    _report(work_index, "bandcamp", f"songkong_bandcamp_{os.path.basename(folder)}", folder)
                    work_index += 1
                    clean_songkong_dirs()
                    run_songkong_task(folder, props_bandcamp, "bandcamp", "-e")
                    summary["steps_run"].append(f"bandcamp:{folder}")
                if "delete_duplicates" in steps:
                    _report(work_index, "delete_duplicates", f"songkong_delete_{os.path.basename(folder)}", folder)
                    work_index += 1
                    clean_songkong_dirs()
                    summ = run_delete_duplicates(folder, props_delete_duplicates)
                    log_action(f"Delete Duplicates for `{folder}`: {summ}")
                    summary["steps_run"].append(f"delete_duplicates:{folder}")
                if "rename" in steps:
                    _report(work_index, "rename", f"songkong_rename_{os.path.basename(folder)}", folder)
                    work_index += 1
                    clean_songkong_dirs()
                    run_rename_phase(folder, rename_props=props_rename)
                    summary["steps_run"].append(f"rename:{folder}")
                mark_processed(folder, "ok")
            except Exception as e:
                log_action(f"Error processing {folder}: {e}")
                mark_processed(folder, "error")
                summary["status"] = "error"
                summary["error"] = str(e)

        if "autoclean_empty" in steps:
            _report(work_index, "autoclean_empty", None, None)
            work_index += 1
            cnt = autoclean_empty_dirs(autoclean_root)
            log_action(f"Clean empty dirs: {cnt} removed")
            summary["steps_run"].append("autoclean_empty")
        if "plex_scans" in steps:
            _report(work_index, "plex_scans", None, None)
            work_index += 1
            triggered = []
            for dump_folder in recent_dump_albums(dump_host_dir):
                if was_processed(dump_folder):
                    continue
                dp = build_dump_path(dump_folder)
                if plex_refresh_folder(dp):
                    triggered.append(dp)
                mark_processed(dump_folder, "ok")
            for mat_folder in recent_matched_albums(MATCHED_HOST_DIR):
                if was_processed(mat_folder):
                    continue
                mp = build_matched_path(mat_folder)
                if plex_refresh_folder(mp):
                    triggered.append(mp)
                mark_processed(mat_folder, "ok")
            summary["steps_run"].append("plex_scans")
        if "plex_trash" in steps:
            _report(work_index, "plex_trash", None, None)
            work_index += 1
            plex_empty_trash()
            summary["steps_run"].append("plex_trash")

        if enable_audit and summary.get("_snapshot_before") is not None:
            try:
                from pipeline_audit import snapshot_zone, compare_snapshots
                snapshot_after = snapshot_zone(folders)
                summary["_snapshot_after"] = snapshot_after
                summary["audit_report"] = compare_snapshots(summary["_snapshot_before"], snapshot_after)
                del summary["_snapshot_before"]
                del summary["_snapshot_after"]
            except Exception as e:
                log_action(f"Audit compare failed: {e}")
                summary["audit_report"] = {"error": str(e)}

        log_action("=== Process completed ===")
    except Exception as e:
        log_action(f"Pipeline error: {e}")
        summary["status"] = "error"
        summary["error"] = str(e)
    finally:
        _log_callback = None
        _progress_callback = None
        _container_log_callback = None
        _plex_overrides = {}
        summary["duration_seconds"] = (datetime.now() - start_time).total_seconds()
    return summary


# -----------------------------------------------------------------------------
# 11) MAIN WORKFLOW (legacy entry point)
# -----------------------------------------------------------------------------
def recent_dump_albums(base: str):
    cutoff = time.time() - DAYS_THRESHOLD * 86400
    for root, _, files in os.walk(base):
        if any(f.lower().endswith((".mp3", ".flac", ".wav")) for f in files):
            if os.stat(root).st_mtime >= cutoff:
                yield root

def recent_matched_albums(base: str):
    cutoff = time.time() - DAYS_THRESHOLD * 86400
    for first in os.listdir(base):
        p1 = os.path.join(base, first)
        if not os.path.isdir(p1):
            continue
        for artist in os.listdir(p1):
            p2 = os.path.join(p1, artist)
            if not os.path.isdir(p2):
                continue
            for album in os.listdir(p2):
                alb = os.path.join(p2, album)
                if os.path.isdir(alb) and os.stat(alb).st_mtime >= cutoff:
                    yield alb

def main() -> None:
    if not os.path.isdir(DUMP_HOST_DIR) or not os.listdir(DUMP_HOST_DIR):
        msg = f"{DUMP_HOST_DIR} not found or empty – abort"
        log_action(msg)
        return
    if not has_music(DUMP_HOST_DIR):
        msg = f"No audio under {DUMP_HOST_DIR} – abort"
        log_action(msg)
        return

    log_action(f"=== Starting process on {DUMP_HOST_DIR} ===")

    # 1) SongKong per daily folder (only days < today)
    today = datetime.now().day
    daily_dirs = sorted(
        d for d in os.listdir(DUMP_HOST_DIR)
        if os.path.isdir(os.path.join(DUMP_HOST_DIR, d))
        and d.split("-", 1)[0].isdigit()
        and int(d.split("-", 1)[0]) < today
    )
    total_days = len(daily_dirs)
    for idx, daily in enumerate(daily_dirs, 1):
        day_path = os.path.join(DUMP_HOST_DIR, daily)
        if was_processed(day_path):
            log_action(f"Skipping SongKong for already processed day {daily}")
            send_discord(f"Skipping SongKong for already processed day {daily}")
            continue
        try:
            clean_songkong_dirs()
            run_songkong_task(day_path, "songkong_fixsongs4.properties", "musicbrainz", "-m")
            clean_songkong_dirs()
            run_songkong_task(day_path, "songkong_bandcamp.properties", "bandcamp", "-e")
            clean_songkong_dirs()
            summ = run_delete_duplicates(day_path, "songkong_deleteduplicates.properties")
            log_action(f"Delete Duplicates for `{day_path}`: {summ}")
            clean_songkong_dirs()
            run_rename_phase(day_path)
            mark_processed(day_path, "ok")
            log_action(f"{get_progress_summary(idx, total_days)} for daily folder {daily}")
        except Exception as e:
            log_action(f"Error SongKong day {daily}: {e}")
            mark_processed(day_path, "error")

    # 2) Clean empty album dirs
    cnt = autoclean_empty_dirs(AUTOCLEAN_ROOT_DIR)
    log_action(f"Clean empty dirs: {cnt} removed")

    # 3) Plex scans: trigger scans for dump and matched folders without waiting
    triggered = []

    # dump side
    for dump_folder in recent_dump_albums(DUMP_HOST_DIR):
        if was_processed(dump_folder):
            continue
        dp = build_dump_path(dump_folder)
        log_action(f"→ Trigger Plex scan for dump path: {dp}")
        send_discord(f"🔄 Triggering Plex scan dump → `{dp}`")
        if plex_refresh_folder(dp):  # sends the refresh request for this path
            triggered.append(dp)
        mark_processed(dump_folder, "ok")

    # matched side
    for mat_folder in recent_matched_albums(MATCHED_HOST_DIR):
        if was_processed(mat_folder):
            continue
        mp = build_matched_path(mat_folder)
        log_action(f"→ Trigger Plex scan for matched path: {mp}")
        send_discord(f"🔄 Triggering Plex scan matched → `{mp}`")
        if plex_refresh_folder(mp):
            triggered.append(mp)
        mark_processed(mat_folder, "ok")

    # 4) Empty Plex trash
    if plex_empty_trash():
        log_action("Plex trash emptied successfully")
    else:
        log_action("Failed to empty Plex trash")

    # Final summary of triggered scans
    if triggered:
        header = f"🔔 Plex scans triggered for {len(triggered)} paths:\n"
        chunk = header
        for entry in triggered:
            line = entry + "\n"
            if len(chunk) + len(line) > 2000:
                send_discord(chunk)
                chunk = ""
            chunk += line
        if chunk:
            send_discord(chunk)
    else:
        send_discord(f"⚠️ No recent albums (<{DAYS_THRESHOLD}d) scanned")

    log_action("=== Process completed ===")

if __name__ == "__main__":
    main()
