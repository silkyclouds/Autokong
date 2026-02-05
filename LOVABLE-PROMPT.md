# Lovable UI/UX design prompt – Autokong

You are an expert UI/UX designer. Your task is to **create a new mockup/redesign** of the web interface for **Autokong**, a tool that orchestrates music library processing (tagging, deduplication, renaming) via SongKong and Plex. The app is a single-page React frontend (Vite) talking to a Flask API. The backend and API are fixed; you only change the frontend (React components, CSS, layout, and visual design).

**Workflow**: Create the redesigned UI based on this prompt. The result will be uploaded to GitHub and then shared with the main Autokong project so the redesigned frontend can be integrated (components and styles merged into the existing repo). This document is the single source of truth for functionality; you decide how it looks and is laid out.

## Design goals

- **Sober and elegant**: Clean layout, no visual clutter. The app is used by one or a few users to run batch jobs and check results; it should feel professional and calm.
- **Attractive colors**: Choose a cohesive, pleasing color palette (e.g. a clear primary, subtle backgrounds, good contrast for text and interactive elements). Avoid generic “AI slop” aesthetics; aim for a distinct but restrained identity.
- **Well formatted**: Clear hierarchy (headings, sections, spacing), readable typography, and alignment that follows standard web design best practices.
- **Web design best practices**: Accessible contrast, focus states, responsive behavior where it makes sense, consistent spacing and component styling. You are free to restructure the layout of each page as you see fit to improve clarity and flow.

You have full freedom to reorganize content, add sections, use cards or panels, improve the navigation, and refine the visual style. The only constraints are: keep the same **functionality** (same data, same actions, same API calls) and keep all **copy in English**.

---

## Tech stack (for context)

- **Frontend**: React 18, React Router, Vite. No UI library is required; you can use plain CSS, CSS modules, or a minimal set of utilities. The app is served as static files from the Flask backend (no separate dev server in production).
- **API base**: All data is fetched from `/api/*` (e.g. `/api/config`, `/api/run`, `/api/history`). You do not change the API.

---

## Pages and functionality to preserve

Describe each page below. You must keep every **behavior** and **piece of data** listed; you are free to change layout, order, and visual presentation.

---

### 1. Global layout and navigation

- **Navigation**: Four main links – **Run**, **History**, **Schedule**, **SongKong Config**. They can be a top nav bar, a sidebar, or another pattern of your choice. The current page should be clearly indicated.
- **Health banner**: At the top (or in a visible spot), a thin bar that shows:
  - If all checks are OK: a short “All systems OK”–style message (e.g. green/success).
  - If something is wrong: “Warning: some paths or files are inaccessible” and optionally list which checks failed (e.g. host_root, songkong_prefs_dir). Use a warning/error style (e.g. amber or red).
- The rest of the view is the **current page** content.

---

### 2. Run page

**Purpose**: Let the user configure and launch a single pipeline run, then watch the log and see the summary and audit.

- **Title**: e.g. “Launch a run”.
- **Scope**: A single select with three options:
  - **Daily (days before today)**
  - **Monthly (entire month)**
  - **All days (all subfolders)**
- **Preview**: Under scope, show how many folders will be processed and list their paths (e.g. “3 folder(s) will be processed: /path/1, /path/2, /path/3”). You can show the full list in a compact, scrollable block if there are many.
- **Steps**: A set of checkboxes for the pipeline steps. Keep the same step IDs (they are sent to the API):  
  `musicbrainz`, `bandcamp`, `delete_duplicates`, `rename`, `final_clash_cleanup`, `autoclean_empty`, `remove_incomplete`, `plex_scans`, `plex_trash`.  
  You can group them (e.g. “Identification”, “Deduplication & rename”, “Cleanup & Plex”) and use clearer labels for display if you want, as long as the values sent to the API stay the same.
- **Final checks**: One checkbox: “Final checks (before/after mapping)”. When checked, the run will include an audit (before/after snapshot comparison). Important for the user to verify no tracks were accidentally removed.
- **Primary action**: A “Launch” button. While the run is starting, it can show “Launching…” and be disabled.
- **After launch**:
  - **Log**: A read-only area (e.g. terminal-style) showing the run log lines in real time. Prefer monospace and a dark background for readability.
  - **Summary**: When the run has finished, show a short summary (e.g. status, steps run, duration). The API returns a JSON summary; you can display it in a readable way (formatted JSON or key fields only).
  - **Audit**: If the run was started with “Final checks” enabled, show the audit section:
    - Counts: “Files deleted: X | Renamed/moved: Y | Albums with holes: Z”.
    - If there are albums with holes, list them: “Artist – Album: N tracks (missing: 1, 3, 5)”.
- **States**: “Loading…” when config is being fetched; show an error message if the API fails. Keep the rest of the UI consistent with these states.

You are free to put the log in a collapsible section, use tabs for Summary vs Audit, or any layout that keeps this information accessible and clear.

---

### 3. History page

**Purpose**: List past runs and let the user open the audit for any run.

- **Title**: e.g. “History”.
- **Table** (or card list): Each row (or card) represents one run. Columns (or fields) to show:
  - **Started** (date/time)
  - **Finished** (date/time or “–” if still running)
  - **Scope** (daily, monthly, all_days)
  - **Status** (e.g. ok, error, no_folders, running)
  - **Action**: A button or link “Audit” to load that run’s audit.
- **Audit detail**: When the user clicks “Audit” for a run, show the audit for that run (same run can be selected again). Display:
  - “Albums with holes: X | Files deleted: Y”.
  - If there are albums with holes, a list: “Artist – Album: missing 1, 3, 5”.
  - If the audit is not available (e.g. run had no audit), show a short message like “Not available”.
- **Errors**: If the history request fails, show an error message.

You can show the audit in a side panel, a modal, or a section below the table; your choice.

---

### 4. Schedule page

**Purpose**: Configure automatic pipeline runs: choose **which jobs** run, **which scope**, and **how often**. The scheduled run can use different steps and scope than the default Run page.

- **Title**: e.g. “Schedule”.
- **Short intro**: e.g. “Configure automatic pipeline runs. When enabled, the selected jobs run at the chosen frequency.”
- **Enable**: A checkbox “Enable scheduled runs”.
- **Frequency**:
  - **Preset**: A select with three options – “Nightly (3:00)”, “Weekly (Sunday 2:00)”, “Monthly (1st at 2:00)”. Each preset sets the cron expression (API stores it).
  - **Cron expression**: A text input (5 fields: min hour day month weekday), placeholder “0 3 * * *”, so advanced users can edit it.
  - **Next run**: If the API returns `next_run`, display “Next run: &lt;date/time&gt;”.
- **Jobs to run**: Which pipeline steps run when the schedule triggers. Same step IDs as the Run page:  
  `musicbrainz`, `bandcamp`, `delete_duplicates`, `rename`, `final_clash_cleanup`, `autoclean_empty`, `remove_incomplete`, `plex_scans`, `plex_trash`.  
  - Show them as checkboxes. By default the schedule can “use default steps from Run page” (API returns `steps: null`); when the user changes the selection, save a custom list for this schedule (`steps` array in API).
  - Optional short hint: “Using default steps from Run page” vs “Custom steps for this schedule”.
  - A “Reset to default (use Run page steps)” button when the user has set custom steps, to clear back to default.
- **Scope**: A single select – “Daily (days before today)”, “Monthly (entire month)”, “All days (all subfolders)”. This is the scope used for each scheduled run (can differ from the Run page default). API field: `scope` (string or null for default).
- **Save**: A primary button e.g. “Save schedule”. While saving, show “Saving…” and disable. On error, show the error message.

Layout and grouping (e.g. cards for Enable, Frequency, Jobs to run, Scope) are up to you.

---

### 5. SongKong Config page

**Purpose**: (1) Choose which SongKong .properties file is used for each pipeline task; (2) view and edit the content of any .properties file.

- **Title**: e.g. “SongKong configuration”.
- **Section 1 – File per task**
  - Short description: the listed files are the .properties files in SongKong’s Prefs folder; the user chooses one per task.
  - Four tasks: **MusicBrainz / Fix songs**, **Bandcamp**, **Delete duplicates**, **Rename files**. For each, a dropdown (select) listing all available .properties files (from the API). The selected value is saved as part of the app config.
  - A “Save configuration” button. Show a short success or error message after save.
- **Section 2 – Edit a .properties file**
  - Short description: select a file, load it, edit the text, then save.
  - A dropdown to choose a file, a “Load” button, then a large textarea showing the file content. A “Save file” button to write the content back. Show success/error feedback for load and save.
- **Loading / error**: If config or file list fails to load, show “Loading…” or an error message. Keep the rest of the page consistent.

You can use two cards, two panels, or a tabbed layout for the two sections.

---

## Summary for Lovable

- **Create a new mockup/redesign** of the Autokong UI: **sober, elegant, attractive colors, clear typography**, following web design best practices.
- **Keep all functionality and all copy in English.** Do not change the API or the data shape.
- **You are free** to reorganize each page (sections, cards, tabs, sidebar, etc.) and to refine the visual design (colors, spacing, fonts, borders, shadows) as you see fit.
- **Preserve**: every field, every button, every API-driven piece of data and behavior described above. Add or adjust only layout, styling, and non-functional copy (e.g. short hints) in English.
- The redesigned frontend will be uploaded to GitHub and then integrated into the main Autokong project; this prompt is the single source of truth for what the app does. Use your expertise to decide how it looks and is laid out.
