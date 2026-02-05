# Scripts

## verify_album_holes.py

Run **on the server** (Unraid) where the music paths exist, to inspect current state of a folder and list albums that have "holes" (missing track numbers according to tags).

- **Audit report "holes"** (in the WebUI) come from a **before vs after** comparison: track numbers that existed in the snapshot *before* the run but not *after*. So 102 albums with holes means either files were removed/moved during the run, or some files had their `track` tag changed/cleared.
- This script only looks at **current state**: it groups files by (artist, album), reads `track` and `track_total` from tags, and reports when expected track numbers 1..N are missing.

### Usage on the server

```bash
# From the Autokong project (or copy the script to the server)
pip install tinytag   # if not already installed

# Full path to the folder you ran (e.g. 03-02 under Music_dump/MM-YYYY/)
python3 verify_album_holes.py /mnt/downloads_cache/MURRAY/Music/Music_dump/02-2025/03-02

# First 5 albums only
python3 verify_album_holes.py /mnt/.../03-02 --limit 5

# Filter by artist
python3 verify_album_holes.py /mnt/.../03-02 --artist "Four Tet"

# Show each file and its track tag
python3 verify_album_holes.py /mnt/.../03-02 --limit 2 -v
```

### Via SSH from your Mac

```bash
ssh root@192.168.3.2 "cd /path/to/Autokong && python3 scripts/verify_album_holes.py /mnt/downloads_cache/MURRAY/Music/Music_dump/02-2025/03-02 --limit 5"
```

Replace `/path/to/Autokong` with the actual path on Unraid (e.g. where the app is mounted or the repo is cloned).

### Quick file count (no Python)

To quickly see how many audio files are in an album directory:

```bash
ssh root@192.168.3.2 "find /mnt/downloads_cache/MURRAY/Music/Music_dump/02-2025/03-02 -type f \( -iname '*.flac' -o -iname '*.mp3' -o -iname '*.m4a' \) | wc -l"
```

List one album directory (replace with a real path from your report). Example for Unraid (month folder may be `02-2026`):

```bash
ssh root@192.168.3.2 "ls -la '/mnt/downloads_cache/MURRAY/Music/Music_dump/02-2026/03-02/Ennio Morricone - Le Monachine - The Little Nuns (1963) [WEB FLAC]/'"
```

### Music_matched structure (verified on server)

On the Unraid server, **Music_matched** is organized as:

- **Level 1**: Letter of the artist (A–Z), plus `0`–`9`, `Classical`, `Classical Compilations`, `Compilations`, `Foreign`, `Special chars`.
- **Level 2**: Artist name (e.g. `F/Four Tet`, `M/Maurizio Bianchi`, `E/Ennio Morricone`).
- **Level 3**: Album folders (e.g. `The Warehouse Project Four Tet in Manchester, Oct 19, 2024 (Flac,  Album; Live; DJ-mix)`).

Example paths:

- `Music_matched/F/Four Tet/The Warehouse Project Four Tet in Manchester, Oct 19, 2024 (...)/`
- `Music_matched/M/Maurizio Bianchi/The Last 23 Minutes (Flac,  Single)/`
- `Music_matched/D/Death Grips/Exmilitary (Flac,  Album; Mixtape-Street)/`
- `Music_matched/E/Ennio Morricone/La resa dei conti (Flac,  Soundtrack; Album)/`

### Causes of "albums with holes" in the audit

1. **Tag split (same folder)**  
   The **artist** (or album) tag changes on some tracks, so they are grouped under a different (artist, album) key. The audit then reports "missing" track numbers for the original key even though the files are still in the same folder. Example: Ennio Morricone – Le Monachine (tracks 8 and 23 tagged "Ennio Morricone & Luciano Salce").

2. **Move to Music_matched**  
   The pipeline only snapshots the **dump** folders (e.g. `03-02`). When SongKong moves matched content to **Music_matched**, those files disappear from the dump, so the audit sees "holes" for that album in the dump. The files are safe under `Music_matched/<Letter>/<Artist>/<Album>/`. Verified: Maurizio Bianchi – The Last 23 Minutes (3 files in matched), Death Grips – Exmilitary (14 files in matched), Ennio Morricone – La resa dei conti (24 files in matched).

3. **Real deletion** (e.g. delete duplicates, script) or **tag "track" changed/cleared**  
   These remain as true holes in the audit.
