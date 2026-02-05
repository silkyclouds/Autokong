export type PipelineStep =
  | 'musicbrainz'
  | 'bandcamp'
  | 'delete_duplicates'
  | 'rename'
  | 'final_clash_cleanup'
  | 'autoclean_empty'
  | 'remove_incomplete'
  | 'plex_scans'
  | 'plex_trash';

export type RunScope = 'daily' | 'monthly' | 'all_days';

export type RunStatus = 'ok' | 'error' | 'no_folders' | 'running';

export interface HealthCheck {
  host_root: boolean;
  songkong_prefs_dir: boolean;
  config_file: boolean;
  [key: string]: boolean;
}

export interface RunConfig {
  scope: RunScope;
  steps: PipelineStep[];
  final_checks: boolean;
}

export interface RunSummary {
  status: RunStatus;
  steps_run: PipelineStep[];
  duration_seconds: number;
  folders_processed: number;
}

export interface AuditResult {
  files_deleted: number;
  files_renamed: number;
  albums_with_holes: AlbumWithHoles[];
}

export interface AlbumWithHoles {
  artist: string;
  album: string;
  total_tracks: number;
  missing_tracks: number[];
}

export interface HistoryEntry {
  id: string;
  started_at: string;
  finished_at: string | null;
  scope: RunScope;
  status: RunStatus;
  has_audit: boolean;
}

export interface ScheduleConfig {
  enabled: boolean;
  cron: string;
  preset: 'nightly' | 'weekly' | 'monthly' | 'custom';
  steps: PipelineStep[] | null;
  scope: RunScope | null;
  next_run: string | null;
}

export interface SongKongConfig {
  musicbrainz_file: string;
  bandcamp_file: string;
  delete_duplicates_file: string;
  rename_file: string;
}

export interface PropertiesFile {
  name: string;
  path: string;
}
