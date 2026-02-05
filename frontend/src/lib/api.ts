const API = '/api';

export async function getConfig() {
  const r = await fetch(`${API}/config`);
  if (!r.ok) throw new Error(r.statusText);
  return r.json();
}

export async function saveConfig(config: Record<string, unknown>) {
  const r = await fetch(`${API}/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  if (!r.ok) throw new Error(r.statusText);
  return r.json();
}

export async function startRun(body: {
  steps?: string[];
  scope?: string;
  enable_audit?: boolean;
  folders?: string[];
} = {}) {
  const r = await fetch(`${API}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(r.statusText);
  return r.json() as Promise<{ job_id: string; started_at: string }>;
}

export async function getJobCurrent() {
  const r = await fetch(`${API}/job/current`);
  if (!r.ok) throw new Error(r.statusText);
  return r.json() as Promise<{
    job_id: string | null;
    started_at?: string;
    progress?: {
      current: number;
      total: number;
      step_id: string;
      step_label: string;
      container_name: string | null;
      folder: string | null;
    };
  }>;
}

export async function getJob(jobId: string) {
  const r = await fetch(`${API}/job/${jobId}`);
  if (!r.ok) throw new Error(r.statusText);
  return r.json();
}

export async function getJobLog(jobId: string) {
  const r = await fetch(`${API}/job/${jobId}/log`);
  if (!r.ok) throw new Error(r.statusText);
  return r.json() as Promise<{ job_id: string; status: string; lines: string[] }>;
}

export async function getJobContainerLog(jobId: string) {
  const r = await fetch(`${API}/job/${jobId}/container-log`);
  if (!r.ok) throw new Error(r.statusText);
  return r.json() as Promise<{ job_id: string; lines: string[] }>;
}

export async function getJobAudit(jobId: string) {
  const r = await fetch(`${API}/job/${jobId}/audit`);
  if (!r.ok) throw new Error(r.statusText);
  return r.json();
}

export async function getHistory() {
  const r = await fetch(`${API}/history`);
  if (!r.ok) throw new Error(r.statusText);
  return r.json();
}

export async function getSchedule() {
  const r = await fetch(`${API}/schedule`);
  if (!r.ok) throw new Error(r.statusText);
  return r.json();
}

export async function saveSchedule(schedule: Record<string, unknown>) {
  const r = await fetch(`${API}/schedule`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(schedule),
  });
  if (!r.ok) throw new Error(r.statusText);
  return r.json();
}

export async function getSongkongConfigList() {
  const r = await fetch(`${API}/songkong-config/list`);
  if (!r.ok) throw new Error(r.statusText);
  return r.json() as Promise<{ files: string[] }>;
}

export async function getSongkongConfigDiscover() {
  const r = await fetch(`${API}/songkong-config/discover`);
  if (!r.ok) throw new Error(r.statusText);
  return r.json() as Promise<{
    discovered_prefs_dir: string | null;
    container_id: string | null;
    files: string[];
    current_prefs_dir: string;
    message?: string;
  }>;
}

export async function getPlexDiscover() {
  const r = await fetch(`${API}/plex/discover`);
  if (!r.ok) throw new Error(r.statusText);
  return r.json() as Promise<{
    containers: {
      id: string;
      name: string;
      image: string;
      state: string;
      env: Record<string, string>;
      mounts: { source: string; destination: string }[];
      ports: Record<string, unknown>;
    }[];
    error?: string;
  }>;
}

export async function getPlexSections() {
  const r = await fetch(`${API}/plex/sections`);
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<{
    sections: { key: string; title: string; type?: string }[];
    error?: string;
  }>;
}

export async function getSongkongConfigFile(filename: string) {
  const r = await fetch(`${API}/songkong-config?file=${encodeURIComponent(filename)}`);
  if (!r.ok) throw new Error(r.statusText);
  return r.json() as Promise<{ path: string; content: string | null; error: string | null }>;
}

export async function putSongkongConfigFile(filename: string, content: string) {
  const r = await fetch(`${API}/songkong-config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file: filename, content }),
  });
  if (!r.ok) throw new Error(r.statusText);
  return r.json();
}

export async function getPreview(scope = 'daily') {
  const r = await fetch(`${API}/preview?scope=${encodeURIComponent(scope)}`);
  if (!r.ok) throw new Error(r.statusText);
  return r.json() as Promise<{ scope: string; count: number; folders: string[] }>;
}

export async function getHealth() {
  const r = await fetch(`${API}/health`);
  if (!r.ok) throw new Error(r.statusText);
  return r.json() as Promise<{ ok: boolean; checks?: Record<string, boolean> }>;
}
