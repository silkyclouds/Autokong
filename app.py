#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Autokong WebUI: Flask API (config, run, job, history, schedule, audit, songkong-config, preview, health).
Serves React static build and runs the pipeline with optional log streaming and audit.
"""

import json
import os
import sqlite3
import threading
import uuid
from datetime import datetime
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

# Ensure we can import the pipeline from the same directory
import sys
_APP_DIR = Path(__file__).resolve().parent
if str(_APP_DIR) not in sys.path:
    sys.path.insert(0, str(_APP_DIR))

from config_manager import config_to_pipeline_overrides, DEFAULT_CONFIG
from settings_db import (
    get_all_settings,
    set_setting,
    set_settings,
    migrate_from_config_json,
    VALID_STEPS,
    VALID_SCOPES,
)

DATA_DIR = os.environ.get("AUTOKONG_DATA_DIR", str(_APP_DIR / "data"))
os.makedirs(DATA_DIR, exist_ok=True)
DB_PATH = os.path.join(DATA_DIR, "runs.db")
SONGKONG_PROP_FILES = [
    "songkong_fixsongs4.properties",
    "songkong_bandcamp.properties",
    "songkong_deleteduplicates.properties",
    "songkong_renamefiles.properties",
]


def _songkong_prefs_dir() -> str:
    """Current SongKong Prefs directory from settings DB."""
    return get_all_settings().get("songkong_prefs_dir") or os.path.join(
        os.environ.get("SONGKONG_CONFIG_DIR", "/mnt/cache/appdata/songkong"), "Prefs"
    )


app = Flask(__name__, static_folder="frontend/build", static_url_path="")
CORS(app)

# In-memory job log (job_id -> list of log lines); completed job logs are in SQLite
_job_logs: dict = {}
_job_logs_lock = threading.Lock()
_current_job_id: str | None = None
# Progress for running job: { current, total, step_id, step_label, container_name, folder }
_job_progress: dict = {}
# Container stdout lines for running/completed job (so UI can show "terminal" log)
_job_container_logs: dict = {}


def init_db():
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS runs (
                id TEXT PRIMARY KEY,
                started_at TEXT NOT NULL,
                finished_at TEXT,
                status TEXT NOT NULL,
                scope TEXT,
                steps_run TEXT,
                summary_json TEXT,
                log_text TEXT,
                audit_report TEXT
            )
        """)
        conn.commit()
        try:
            conn.execute("ALTER TABLE runs ADD COLUMN container_log_text TEXT")
            conn.commit()
        except sqlite3.OperationalError:
            pass


def run_pipeline_job(job_id: str, steps: list, scope: str, enable_audit: bool, config_overrides: dict):
    """Background thread: run the pipeline and store result in DB."""
    log_lines = []
    _job_progress[job_id] = {}
    _job_container_logs[job_id] = []

    def log_cb(line: str):
        log_lines.append(line)
        with _job_logs_lock:
            _job_logs[job_id] = list(log_lines)

    def progress_cb(current: int, total: int, step_id: str, step_label: str, container_name: str, folder: str):
        _job_progress[job_id] = {
            "current": current,
            "total": max(1, total),
            "step_id": step_id,
            "step_label": step_label,
            "container_name": (container_name or "").strip() or None,
            "folder": (folder or "").strip() or None,
        }

    def container_log_cb(line: str):
        _job_container_logs[job_id].append(line)

    try:
        import Autokong_nightly_process as pipeline
        summary = pipeline.run_pipeline(
            steps=steps,
            scope=scope,
            log_callback=log_cb,
            enable_audit=enable_audit,
            config_overrides=config_overrides,
            progress_callback=progress_cb,
            container_log_callback=container_log_cb,
        )
        status = summary.get("status", "ok")
        audit_report = summary.get("audit_report")
    except Exception as e:
        summary = {"status": "error", "error": str(e)}
        status = "error"
        audit_report = None
        log_lines.append(f"{datetime.now()} - Pipeline error: {e}")
    finished_at = datetime.utcnow().isoformat() + "Z"
    container_log_lines = _job_container_logs.get(job_id, [])
    container_log_text = "\n".join(container_log_lines) if container_log_lines else None
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            """INSERT OR REPLACE INTO runs (id, started_at, finished_at, status, scope, steps_run, summary_json, log_text, audit_report, container_log_text)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                job_id,
                _runs_get(job_id) or datetime.utcnow().isoformat() + "Z",
                finished_at,
                status,
                scope,
                json.dumps(summary.get("steps_run", [])),
                json.dumps(summary),
                "\n".join(log_lines),
                json.dumps(audit_report) if audit_report is not None else None,
                container_log_text,
            ),
        )
        conn.commit()
    with _job_logs_lock:
        _job_logs.pop(job_id, None)
    _job_progress.pop(job_id, None)
    _job_container_logs.pop(job_id, None)
    global _current_job_id
    if _current_job_id == job_id:
        _current_job_id = None


# Store started_at for a job before thread runs (so we have it when thread finishes)
_started_at: dict = {}
_started_at_lock = threading.Lock()


def _runs_get(job_id: str) -> str | None:
    with _started_at_lock:
        return _started_at.get(job_id)


def _runs_set(job_id: str, started_at: str):
    with _started_at_lock:
        _started_at[job_id] = started_at


@app.route("/api/config", methods=["GET"])
def api_config_get():
    return jsonify(get_all_settings())


@app.route("/api/config", methods=["POST"])
def api_config_post():
    data = request.get_json(force=True, silent=True) or {}
    updates = {}
    for key in ("steps_enabled", "scope", "schedule", "audit_enabled", "paths", "songkong_files",
                "songkong_prefs_dir", "plex_host", "plex_token", "plex_library_section",
                "plex_dump_path", "plex_matched_path", "plex_retry_interval"):
        if key not in data:
            continue
        value = data[key]
        if key == "steps_enabled" and isinstance(value, list):
            value = [s for s in value if s in VALID_STEPS]
        if key == "scope" and value not in VALID_SCOPES:
            value = "daily"
        updates[key] = value
    if updates:
        try:
            set_settings(updates)
        except ValueError as e:
            return jsonify({"error": str(e)}), 400
    return jsonify(get_all_settings())


@app.route("/api/run", methods=["POST"])
def api_run():
    data = request.get_json(force=True, silent=True) or {}
    # Config (including Plex token, paths, etc.) is read from DB so runs use latest saved values
    config = get_all_settings()
    raw_steps = data.get("steps") or config.get("steps_enabled") or DEFAULT_CONFIG["steps_enabled"]
    # Par sécurité, on filtre toujours les étapes contre VALID_STEPS afin que
    # d'anciennes configs ne puissent pas réactiver des étapes retirées
    # (comme "delete_duplicates").
    steps = [s for s in raw_steps if s in VALID_STEPS]
    scope = data.get("scope") or config.get("scope") or "daily"
    enable_audit = data.get("enable_audit") if "enable_audit" in data else config.get("audit_enabled", False)
    config_overrides = config_to_pipeline_overrides(config)
    if isinstance(data.get("folders"), list):
        config_overrides["folders"] = [f for f in data["folders"] if isinstance(f, str) and f.strip()]
    job_id = str(uuid.uuid4())
    started_at = datetime.utcnow().isoformat() + "Z"
    _runs_set(job_id, started_at)
    with _job_logs_lock:
        _job_logs[job_id] = []
    global _current_job_id
    _current_job_id = job_id
    t = threading.Thread(
        target=run_pipeline_job,
        args=(job_id, steps, scope, enable_audit, config_overrides),
        daemon=True,
    )
    t.start()
    return jsonify({"job_id": job_id, "started_at": started_at})


@app.route("/api/job/current")
def api_job_current():
    """Return the currently running job id and progress, or job_id: null if none."""
    global _current_job_id
    if _current_job_id is None:
        return jsonify({"job_id": None})
    job_id = _current_job_id
    started_at = _runs_get(job_id)
    progress = _job_progress.get(job_id)
    return jsonify({
        "job_id": job_id,
        "started_at": started_at,
        "progress": progress,
    })


@app.route("/api/job/<job_id>")
def api_job(job_id):
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute("SELECT * FROM runs WHERE id = ?", (job_id,)).fetchone()
    if row is None:
        with _job_logs_lock:
            if job_id in _job_logs:
                payload = {
                    "job_id": job_id,
                    "status": "running",
                    "started_at": _runs_get(job_id),
                    "log_tail": _job_logs[job_id][-100:],
                }
                if job_id in _job_progress:
                    payload["progress"] = _job_progress[job_id]
                return jsonify(payload)
        return jsonify({"error": "Job not found"}), 404
    return jsonify({
        "job_id": row["id"],
        "started_at": row["started_at"],
        "finished_at": row["finished_at"],
        "status": row["status"],
        "scope": row["scope"],
        "steps_run": json.loads(row["steps_run"]) if row["steps_run"] else [],
        "summary": json.loads(row["summary_json"]) if row["summary_json"] else None,
    })


@app.route("/api/job/<job_id>/log")
def api_job_log(job_id):
    with _job_logs_lock:
        if job_id in _job_logs:
            return jsonify({"job_id": job_id, "status": "running", "lines": _job_logs[job_id]})
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute("SELECT log_text FROM runs WHERE id = ?", (job_id,)).fetchone()
    if row is None:
        return jsonify({"error": "Job not found"}), 404
    lines = (row["log_text"] or "").split("\n")
    return jsonify({"job_id": job_id, "status": "done", "lines": lines})


@app.route("/api/job/<job_id>/container-log")
def api_job_container_log(job_id):
    """Return Docker container stdout lines (SongKong). Live during run, or persisted after run."""
    if job_id in _job_container_logs:
        return jsonify({"job_id": job_id, "lines": _job_container_logs[job_id]})
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        try:
            row = conn.execute(
                "SELECT container_log_text FROM runs WHERE id = ?", (job_id,)
            ).fetchone()
        except sqlite3.OperationalError:
            row = None
    if row is not None and row["container_log_text"]:
        lines = (row["container_log_text"] or "").strip().split("\n")
        return jsonify({"job_id": job_id, "lines": lines})
    return jsonify({"job_id": job_id, "lines": []})


@app.route("/api/job/<job_id>/audit")
def api_job_audit(job_id):
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute("SELECT audit_report FROM runs WHERE id = ?", (job_id,)).fetchone()
    if row is None or row["audit_report"] is None:
        return jsonify({"error": "Audit not found or not run"}), 404
    return jsonify(json.loads(row["audit_report"]))


@app.route("/api/history")
def api_history():
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            "SELECT id, started_at, finished_at, status, scope, summary_json FROM runs ORDER BY started_at DESC LIMIT 100"
        ).fetchall()
    return jsonify([
        {
            "id": r["id"],
            "started_at": r["started_at"],
            "finished_at": r["finished_at"],
            "status": r["status"],
            "scope": r["scope"],
            "summary": json.loads(r["summary_json"]) if r["summary_json"] else None,
        }
        for r in rows
    ])


@app.route("/api/schedule", methods=["GET"])
def api_schedule_get():
    config = get_all_settings()
    schedule = config.get("schedule") or {}
    next_run = None
    try:
        sched = getattr(_schedule_reload, "_scheduler", None)
        if sched:
            job = sched.get_job("autokong_run")
            if job and job.next_run_time:
                next_run = job.next_run_time.isoformat()
    except Exception:
        pass
    return jsonify({
        "enabled": schedule.get("enabled", False),
        "cron": schedule.get("cron", "0 3 * * *"),
        "preset": schedule.get("preset", "nightly"),
        "steps": schedule.get("steps"),
        "scope": schedule.get("scope"),
        "next_run": next_run,
    })


@app.route("/api/schedule", methods=["POST"])
def api_schedule_post():
    data = request.get_json(force=True, silent=True) or {}
    config = get_all_settings()
    prev = config.get("schedule") or {}
    schedule = {
        "enabled": data.get("enabled", prev.get("enabled", False)),
        "cron": data.get("cron", prev.get("cron", "0 3 * * *")),
        "preset": data.get("preset", prev.get("preset", "nightly")),
        "steps": data.get("steps") if "steps" in data else prev.get("steps"),
        "scope": data.get("scope") if "scope" in data else prev.get("scope"),
    }
    try:
        set_setting("schedule", schedule)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    _schedule_reload()
    return jsonify(get_all_settings()["schedule"])


def _schedule_reload():
    """Reload APScheduler job from config."""
    if "_scheduler" not in dir(_schedule_reload):
        return
    sched = getattr(_schedule_reload, "_scheduler", None)
    if sched is None:
        return
    try:
        sched.remove_job("autokong_run")
    except Exception:
        pass
    config = get_all_settings()
    schedule = config.get("schedule") or {}
    if not schedule.get("enabled"):
        return
    cron = schedule.get("cron", "0 3 * * *")
    if cron.strip():
        from apscheduler.schedulers.background import BackgroundScheduler
        from apscheduler.triggers.cron import CronTrigger
        sched.add_job(
            _trigger_run,
            CronTrigger.from_crontab(cron),
            id="autokong_run",
        )


def _trigger_run():
    """Called by scheduler: start a run with schedule overrides or current config."""
    config = get_all_settings()
    schedule = config.get("schedule") or {}
    raw_steps = schedule.get("steps") if schedule.get("steps") is not None else (config.get("steps_enabled") or DEFAULT_CONFIG["steps_enabled"])
    steps = [s for s in raw_steps if s in VALID_STEPS]
    scope = schedule.get("scope") or config.get("scope") or "daily"
    enable_audit = config.get("audit_enabled", False)
    config_overrides = config_to_pipeline_overrides(config)
    job_id = str(uuid.uuid4())
    _runs_set(job_id, datetime.utcnow().isoformat() + "Z")
    with _job_logs_lock:
        _job_logs[job_id] = []
    global _current_job_id
    _current_job_id = job_id
    threading.Thread(
        target=run_pipeline_job,
        args=(job_id, steps, scope, enable_audit, config_overrides),
        daemon=True,
    ).start()


def _list_songkong_properties():
    """Return sorted list of .properties filenames in current SongKong Prefs dir."""
    prefs = _songkong_prefs_dir()
    if not os.path.isdir(prefs):
        return []
    return sorted(
        f for f in os.listdir(prefs)
        if f.endswith(".properties")
    )


def _discover_songkong_prefs_from_docker():
    """Use Docker to find SongKong container's /songkong mount (host path). Returns (host_prefs_dir, container_id) or (None, None)."""
    import subprocess
    try:
        out = subprocess.run(
            ["docker", "ps", "-a", "--filter", "ancestor=songkong/songkong", "--format", "{{.ID}}"],
            capture_output=True, text=True, timeout=10,
        )
        if out.returncode != 0 or not out.stdout.strip():
            return None, None
        cid = out.stdout.strip().split()[0]
        insp = subprocess.run(
            ["docker", "inspect", cid, "--format", "{{json .Mounts}}"],
            capture_output=True, text=True, timeout=5,
        )
        if insp.returncode != 0 or not insp.stdout.strip():
            return None, None
        mounts = json.loads(insp.stdout)
        for m in mounts:
            dest = (m.get("Destination") or "").rstrip("/")
            if dest == "/songkong" or dest.endswith("/songkong"):
                src = (m.get("Source") or "").strip()
                if src:
                    prefs = os.path.join(src, "Prefs")
                    return prefs, cid
        return None, None
    except Exception:
        return None, None


@app.route("/api/songkong-config/discover")
def api_songkong_config_discover():
    """Discover SongKong Prefs path from a SongKong container's /songkong mount (requires Docker socket)."""
    prefs_dir, container_id = _discover_songkong_prefs_from_docker()
    if prefs_dir and os.path.isdir(prefs_dir):
        files = sorted(f for f in os.listdir(prefs_dir) if f.endswith(".properties"))
        return jsonify({
            "discovered_prefs_dir": prefs_dir,
            "container_id": container_id,
            "files": files,
            "current_prefs_dir": _songkong_prefs_dir(),
        })
    return jsonify({
        "discovered_prefs_dir": None,
        "container_id": None,
        "files": _list_songkong_properties(),
        "current_prefs_dir": _songkong_prefs_dir(),
        "message": "No SongKong container with /songkong mount found; using settings.",
    })


@app.route("/api/songkong-config/list")
def api_songkong_config_list():
    return jsonify({"files": _list_songkong_properties()})


@app.route("/api/songkong-config")
def api_songkong_config():
    """GET: ?file=xxx.properties returns one file; no query returns all listed files content."""
    single = request.args.get("file")
    prefs = _songkong_prefs_dir()
    if single:
        path = os.path.join(prefs, single)
        if not os.path.abspath(path).startswith(os.path.abspath(prefs)):
            return jsonify({"path": path, "content": None, "error": "Invalid file"}), 400
        if not os.path.isfile(path):
            return jsonify({"path": path, "content": None, "error": "File not found"}), 404
        try:
            with open(path, "r", encoding="utf-8", errors="replace") as f:
                return jsonify({"path": path, "content": f.read(), "error": None})
        except Exception as e:
            return jsonify({"path": path, "content": None, "error": str(e)}), 500
    # No query: return content for all .properties in Prefs (for backward compat / simple UI)
    files = _list_songkong_properties()
    result = {}
    for name in files:
        path = os.path.join(prefs, name)
        try:
            with open(path, "r", encoding="utf-8", errors="replace") as f:
                result[name] = {"path": path, "content": f.read(), "error": None}
        except Exception as e:
            result[name] = {"path": path, "content": None, "error": str(e)}
    return jsonify(result)


@app.route("/api/songkong-config", methods=["PUT", "POST"])
def api_songkong_config_put():
    """Save one .properties file. Body: { "file": "xxx.properties", "content": "..." }."""
    data = request.get_json(force=True, silent=True) or {}
    name = (data.get("file") or data.get("filename") or "").strip()
    content = data.get("content")
    if not name or not name.endswith(".properties"):
        return jsonify({"error": "Missing or invalid file (must end with .properties)"}), 400
    prefs = _songkong_prefs_dir()
    path = os.path.join(prefs, name)
    if not os.path.abspath(path).startswith(os.path.abspath(prefs)):
        return jsonify({"error": "Invalid file path"}), 400
    if content is None:
        return jsonify({"error": "Missing content"}), 400
    try:
        os.makedirs(prefs, exist_ok=True)
        with open(path, "w", encoding="utf-8", newline="\n") as f:
            f.write(content if isinstance(content, str) else "")
        return jsonify({"path": path, "saved": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/plex/discover")
def api_plex_discover():
    """Discover Plex containers via Docker: id, name, state, env, port mappings, mounts."""
    import subprocess
    result = []
    try:
        # List containers with image or name containing 'plex'
        out = subprocess.run(
            ["docker", "ps", "-a", "--format", "{{.ID}}\t{{.Names}}\t{{.Image}}\t{{.State}}"],
            capture_output=True, text=True, timeout=10,
        )
        if out.returncode != 0:
            return jsonify({"containers": [], "error": out.stderr or "docker ps failed"})
        for line in out.stdout.strip().splitlines():
            if not line.strip():
                continue
            parts = line.split("\t", 3)
            if len(parts) < 4:
                continue
            cid, names, image, state = parts[0], parts[1], parts[2], parts[3]
            if "plex" not in image.lower() and "plex" not in names.lower():
                continue
            env_out = subprocess.run(
                ["docker", "inspect", cid, "--format", "{{json .Config.Env}}"],
                capture_output=True, text=True, timeout=5,
            )
            mounts_out = subprocess.run(
                ["docker", "inspect", cid, "--format", "{{json .Mounts}}"],
                capture_output=True, text=True, timeout=5,
            )
            env_list = json.loads(env_out.stdout) if env_out.returncode == 0 and env_out.stdout.strip() else []
            env = {e.split("=", 1)[0]: e.split("=", 1)[1] if "=" in e else "" for e in env_list if "=" in e}
            mounts_list = json.loads(mounts_out.stdout) if mounts_out.returncode == 0 and mounts_out.stdout.strip() else []
            mounts = [{"source": m.get("Source"), "destination": m.get("Destination")} for m in mounts_list]
            port_out = subprocess.run(
                ["docker", "inspect", cid, "--format", "{{json .NetworkSettings.Ports}}"],
                capture_output=True, text=True, timeout=5,
            )
            ports = {}
            if port_out.returncode == 0 and port_out.stdout.strip():
                try:
                    ports = json.loads(port_out.stdout)
                except Exception:
                    pass
            result.append({
                "id": cid,
                "name": names,
                "image": image,
                "state": state,
                "env": env,
                "mounts": mounts,
                "ports": ports,
            })
    except Exception as e:
        return jsonify({"containers": [], "error": str(e)})
    return jsonify({"containers": result})


@app.route("/api/plex/sections")
def api_plex_sections():
    """Return Plex library sections (key, title, type) using current plex_host/token."""
    import requests
    config = get_all_settings()
    host = (config.get("plex_host") or "").strip()
    token = (config.get("plex_token") or "").strip()
    if not host or not token:
        return jsonify({"error": "plex_host and plex_token must be configured first"}), 400
    url = f"{host.rstrip('/')}/library/sections"
    try:
        r = requests.get(url, headers={"X-Plex-Token": token}, timeout=10)
    except Exception as e:
        return jsonify({"error": f"Request to Plex failed: {e}"}), 500
    if r.status_code != 200:
        return jsonify({"error": f"Plex returned {r.status_code}", "details": r.text[:500]}), 502
    try:
        import xml.etree.ElementTree as ET
        root = ET.fromstring(r.content)
        sections = []
        for node in root.findall("Directory"):
            sections.append({
                "key": node.get("key"),
                "title": node.get("title"),
                "type": node.get("type"),
            })
        return jsonify({"sections": sections})
    except Exception as e:
        return jsonify({"error": f"Failed to parse Plex response: {e}"}), 500


@app.route("/api/preview")
def api_preview():
    scope = request.args.get("scope", "daily")
    config = get_all_settings()
    paths = config.get("paths") or {}
    host_root = paths.get("host_root") or "/mnt/downloads_cache/MURRAY/Music"
    # Supporte un dossier ou plusieurs dossiers de départ.
    dump_dirs = []
    primary_dump = paths.get("dump_host_dir")
    extra_dumps = paths.get("dump_host_dirs") or []
    if isinstance(primary_dump, str) and primary_dump.strip():
        dump_dirs.append(primary_dump)
    if isinstance(extra_dumps, list):
        dump_dirs.extend([d for d in extra_dumps if isinstance(d, str) and d.strip()])
    if not dump_dirs:
        from datetime import timedelta
        yesterday = datetime.now() - timedelta(days=1)
        dump_dirs = [os.path.join(host_root, "Music_dump", yesterday.strftime("%m-%Y"), "")]
    try:
        import Autokong_nightly_process as pipeline
        folders = []
        for d in dump_dirs:
            folders.extend(pipeline.get_folders_to_process(scope, d))
    except Exception as e:
        return jsonify({"scope": scope, "count": 0, "folders": [], "error": str(e)}), 200
    return jsonify({"scope": scope, "count": len(folders), "folders": folders})


@app.route("/api/health")
def api_health():
    config = get_all_settings()
    paths = config.get("paths") or {}
    host_root = paths.get("host_root") or "/mnt/downloads_cache/MURRAY/Music"
    dump_dir = paths.get("dump_host_dir")
    if not dump_dir:
        from datetime import timedelta
        yesterday = datetime.now() - timedelta(days=1)
        dump_dir = os.path.join(host_root, "Music_dump", yesterday.strftime("%m-%Y"), "")
    prefs = _songkong_prefs_dir()
    checks = {
        "host_root": os.path.isdir(host_root),
        "dump_dir": os.path.isdir(dump_dir) if dump_dir else False,
        "songkong_prefs_dir": os.path.isdir(prefs),
    }
    for name in SONGKONG_PROP_FILES:
        checks[f"songkong_{name}"] = os.path.isfile(os.path.join(prefs, name))
    critical = checks.get("host_root", False) and checks.get("songkong_prefs_dir", False)
    all_ok = critical
    return jsonify({"ok": all_ok, "checks": checks})


@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_spa(path):
    if path and os.path.isfile(os.path.join(app.static_folder or "", path)):
        return send_from_directory(app.static_folder or ".", path)
    if app.static_folder and os.path.isfile(os.path.join(app.static_folder, "index.html")):
        return send_from_directory(app.static_folder, "index.html")
    return jsonify({"message": "Autokong API", "docs": "Use the React app or /api/config, /api/run, /api/history, etc."})


def init_scheduler():
    from apscheduler.schedulers.background import BackgroundScheduler
    sched = BackgroundScheduler()
    _schedule_reload._scheduler = sched
    _schedule_reload()
    sched.start()
    return sched


# Ensure settings and runs DBs exist on load (for any server)
migrate_from_config_json()
init_db()

if __name__ == "__main__":
    init_scheduler()
    app.run(host="0.0.0.0", port=5000, threaded=True)
