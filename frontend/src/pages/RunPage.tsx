import { useState, useEffect } from 'react';
import { Play, Folder, FileCheck, Loader2, Container, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/shared/Card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/shared/Select';
import { Checkbox } from '@/components/shared/Checkbox';
import { Terminal } from '@/components/shared/Terminal';
import { Progress } from '@/components/ui/progress';
import { StatusBadge } from '@/components/shared/StatusBadge';
import * as api from '@/lib/api';
import type { PipelineStep, RunScope, RunSummary, AuditResult } from '@/types/autokong';

export interface JobProgress {
  current: number;
  total: number;
  step_id: string;
  step_label: string;
  container_name: string | null;
  folder: string | null;
}

const scopeOptions: { value: RunScope; label: string; description: string }[] = [
  { value: 'daily', label: 'Daily', description: 'Process days before today' },
  { value: 'monthly', label: 'Monthly', description: 'Process entire month' },
  { value: 'all_days', label: 'All days', description: 'Process all subfolders' },
];

const stepGroups: { label: string; steps: { id: PipelineStep; label: string }[] }[] = [
  {
    label: 'Identification',
    steps: [
      { id: 'musicbrainz', label: 'MusicBrainz / Fix songs' },
      { id: 'bandcamp', label: 'Bandcamp' },
    ],
  },
  {
    label: 'Deduplication & Rename',
    steps: [
      { id: 'delete_duplicates', label: 'Delete duplicates' },
      { id: 'rename', label: 'Rename files' },
    ],
  },
  {
    label: 'Cleanup & Plex',
    steps: [
      { id: 'autoclean_empty', label: 'Auto-clean empty folders' },
      { id: 'plex_scans', label: 'Plex scans' },
      { id: 'plex_trash', label: 'Plex trash' },
    ],
  },
];

const allSteps = stepGroups.flatMap((g) => g.steps.map((s) => s.id));

export function RunPage() {
  const [scope, setScope] = useState<RunScope>('daily');
  const [selectedSteps, setSelectedSteps] = useState<Set<PipelineStep>>(new Set(allSteps));
  const [finalChecks, setFinalChecks] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isLaunching, setIsLaunching] = useState(false);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [summary, setSummary] = useState<RunSummary | null>(null);
  const [audit, setAudit] = useState<AuditResult | null>(null);
  const [previewFolders, setPreviewFolders] = useState<string[]>([]);
  const [selectedFolders, setSelectedFolders] = useState<Set<string>>(new Set());
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState<JobProgress | null>(null);
  const [containerLogLines, setContainerLogLines] = useState<string[]>([]);
  const [showContainerTerminal, setShowContainerTerminal] = useState(false);

  useEffect(() => {
    api.getConfig().then((c: { scope?: string; steps_enabled?: string[]; audit_enabled?: boolean }) => {
      if (c.scope) setScope(c.scope as RunScope);
      if (c.steps_enabled?.length) setSelectedSteps(new Set(c.steps_enabled as PipelineStep[]));
      if (c.audit_enabled != null) setFinalChecks(!!c.audit_enabled);
    }).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setPreviewError(null);
    api.getPreview(scope).then((p) => {
      const folders = p.folders || [];
      setPreviewFolders(folders);
      setSelectedFolders(new Set(folders));
      const err = (p as { error?: string }).error;
      if (err) setPreviewError(err);
    }).catch((e: Error) => {
      setPreviewFolders([]);
      setSelectedFolders(new Set());
      setPreviewError(e.message || 'Failed to load folders');
    });
  }, [scope]);

  // Container log is polled together with job+log in the main poll loop when isRunning

  const toggleStep = (step: PipelineStep) => {
    const newSteps = new Set(selectedSteps);
    if (newSteps.has(step)) newSteps.delete(step);
    else newSteps.add(step);
    setSelectedSteps(newSteps);
  };

  const toggleFolder = (folder: string) => {
    const next = new Set(selectedFolders);
    if (next.has(folder)) next.delete(folder);
    else next.add(folder);
    setSelectedFolders(next);
  };

  const selectAllFolders = () => setSelectedFolders(new Set(previewFolders));
  const deselectAllFolders = () => setSelectedFolders(new Set());

  const handleLaunch = async () => {
    setError(null);
    setIsLaunching(true);
    setSummary(null);
    setAudit(null);
    setLogLines([]);
    setContainerLogLines([]);
    setProgress(null);
    setJobId(null);
    try {
      await api.saveConfig({
        steps_enabled: Array.from(selectedSteps),
        scope,
        audit_enabled: finalChecks,
      });
      const { job_id } = await api.startRun({
        steps: Array.from(selectedSteps),
        scope,
        enable_audit: finalChecks,
        folders: Array.from(selectedFolders),
      });
      setJobId(job_id);
      setIsLaunching(false);
      setIsRunning(true);
      setShowContainerTerminal(true);

      const poll = async () => {
        try {
          const [job, log, containerLog] = await Promise.all([
            api.getJob(job_id),
            api.getJobLog(job_id),
            api.getJobContainerLog(job_id),
          ]);
          setLogLines(log.lines || []);
          setContainerLogLines(containerLog.lines || []);
          if ((job as { progress?: JobProgress }).progress) {
            setProgress((job as { progress: JobProgress }).progress);
          }
          if (job.status !== 'running') {
            setIsRunning(false);
            setProgress(null);
            setSummary(job.summary as RunSummary);
            const finalContainerLog = await api.getJobContainerLog(job_id).catch(() => ({ lines: [] }));
            setContainerLogLines(finalContainerLog.lines || []);
            if ((job.status === 'ok' || job.status === 'error') && finalChecks) {
              try {
                const a = await api.getJobAudit(job_id);
                const sum = (a as { summary?: { files_deleted_count?: number; files_renamed_or_moved_count?: number }; albums_with_holes?: { artist: string; album: string; after_count?: number; missing_tracks?: number[] }[] }).summary;
                const holes = (a as { albums_with_holes?: { artist: string; album: string; after_count?: number; missing_tracks?: number[] }[] }).albums_with_holes || [];
                setAudit({
                  files_deleted: sum?.files_deleted_count ?? 0,
                  files_renamed: sum?.files_renamed_or_moved_count ?? 0,
                  albums_with_holes: holes.map((h) => ({
                    artist: h.artist,
                    album: h.album,
                    total_tracks: h.after_count,
                    missing_tracks: h.missing_tracks || [],
                  })),
                });
              } catch {
                setAudit(null);
              }
            }
            return;
          }
        } catch {
          setIsRunning(false);
          return;
        }
        setTimeout(poll, 1000);
      };
      poll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Launch failed');
      setIsLaunching(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center px-4 py-8 sm:p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="px-4 py-6 sm:p-8">
      {error && (
        <div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}
      <div className="mb-6 sm:mb-8">
        <h1 className="text-xl sm:text-2xl font-semibold text-foreground">Launch a run</h1>
        <p className="mt-1 text-muted-foreground">
          Configure and launch a pipeline run to process your music library
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Folder className="h-4 w-4 text-primary" />
                Scope
              </CardTitle>
              <CardDescription>Choose which folders to process</CardDescription>
            </CardHeader>
            <CardContent>
              <Select value={scope} onValueChange={(v) => setScope(v as RunScope)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {scopeOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <div className="flex flex-col">
                        <span>{opt.label}</span>
                        <span className="text-xs text-muted-foreground">{opt.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="mt-4 rounded-lg border border-border bg-muted/30 p-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <p className="text-sm font-medium text-foreground">
                    {selectedFolders.size} / {previewFolders.length} folder(s) selected
                  </p>
                  <div className="flex gap-1">
                    <Button type="button" variant="outline" size="sm" onClick={selectAllFolders}>
                      Select all
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={deselectAllFolders}>
                      Deselect all
                    </Button>
                  </div>
                </div>
                <div className="mt-2 max-h-48 overflow-y-auto space-y-1">
                  {previewError && (
                    <p className="text-sm text-destructive mb-2">{previewError}</p>
                  )}
                  {previewFolders.length === 0 && !previewError && (
                    <p className="text-sm text-muted-foreground">No folders found for this scope. Check Config → Paths (host_root, dump_host_dir) or that the dump directory exists on the server.</p>
                  )}
                  {previewFolders.map((folder, i) => (
                    <label
                      key={i}
                      className="flex cursor-pointer items-center gap-2 rounded p-1.5 hover:bg-accent/50 font-mono text-xs"
                    >
                      <Checkbox
                        checked={selectedFolders.has(folder)}
                        onCheckedChange={() => toggleFolder(folder)}
                      />
                      <span className="truncate text-muted-foreground" title={folder}>
                        {folder.split(/[/\\]/).pop() || folder}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Pipeline steps</CardTitle>
              <CardDescription>Select which steps to run</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {stepGroups.map((group) => (
                <div key={group.label}>
                  <p className="section-header">{group.label}</p>
                  <div className="space-y-2">
                    {group.steps.map((step) => (
                      <label
                        key={step.id}
                        className="flex cursor-pointer items-center gap-3 rounded-lg p-2 transition-colors hover:bg-accent/50"
                      >
                        <Checkbox
                          checked={selectedSteps.has(step.id)}
                          onCheckedChange={() => toggleStep(step.id)}
                        />
                        <span className="text-sm">{step.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              <div className="border-t border-border pt-4">
                <label className="flex cursor-pointer items-center gap-3 rounded-lg p-2 transition-colors hover:bg-accent/50">
                  <Checkbox
                    checked={finalChecks}
                    onCheckedChange={(c) => setFinalChecks(!!c)}
                  />
                  <div>
                    <span className="text-sm font-medium">Final checks</span>
                    <p className="text-xs text-muted-foreground">Before/after mapping comparison</p>
                  </div>
                </label>
              </div>
            </CardContent>
          </Card>

          <Button
            className="w-full"
            size="lg"
            onClick={handleLaunch}
            disabled={isLaunching || isRunning || selectedSteps.size === 0 || selectedFolders.size === 0}
          >
            {isLaunching ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Launching...
              </>
            ) : isRunning ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Running...
              </>
            ) : (
              <>
                <Play className="h-4 w-4" />
                Launch run
              </>
            )}
          </Button>
        </div>

        <div className="space-y-6 lg:col-span-2">
          {isRunning && progress && (
            <Card className="overflow-hidden border-primary/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  Run in progress
                </CardTitle>
                <CardDescription>
                  Step {progress.current + 1} of {progress.total} — {progress.step_label}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Progress value={progress.total ? ((progress.current + 1) / progress.total) * 100 : 0} className="h-2" />
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  {progress.container_name && (
                    <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 font-mono">
                      <Container className="h-3.5 w-3.5 text-muted-foreground" />
                      {progress.container_name}
                    </span>
                  )}
                  {progress.folder && (
                    <span className="truncate max-w-[280px] text-muted-foreground" title={progress.folder}>
                      {progress.folder}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Pipeline log (Autokong)
                {isRunning && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                    Live
                  </span>
                )}
              </CardTitle>
              <CardDescription>
                Main process: steps started, SongKong summaries, errors
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Terminal lines={logLines} maxHeight="320px" />
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader
              className="cursor-pointer select-none hover:bg-muted/50 transition-colors"
              onClick={() => setShowContainerTerminal(!showContainerTerminal)}
            >
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Container className="h-4 w-4 text-muted-foreground" />
                  SongKong container log
                </CardTitle>
                {showContainerTerminal ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
              <CardDescription>
                Live stdout of the current SongKong Docker container (MusicBrainz, delete duplicates, rename, etc.)
              </CardDescription>
            </CardHeader>
            {showContainerTerminal && (
              <CardContent>
                <Terminal lines={containerLogLines} maxHeight="320px" className="rounded-b-lg border border-border" />
              </CardContent>
            )}
          </Card>

          {summary && (
            <Card className="animate-fade-in">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileCheck className="h-4 w-4 text-success" />
                  Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-lg border border-border bg-muted/30 p-4">
                    <p className="text-xs text-muted-foreground">Status</p>
                    <div className="mt-1">
                      <StatusBadge status={summary.status as 'ok' | 'error' | 'no_folders' | 'running'} />
                    </div>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/30 p-4">
                    <p className="text-xs text-muted-foreground">Duration</p>
                    <p className="mt-1 text-xl font-semibold">{summary.duration_seconds}s</p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/30 p-4">
                    <p className="text-xs text-muted-foreground">Steps run</p>
                    <p className="mt-1 text-xl font-semibold">{Array.isArray(summary.steps_run) ? summary.steps_run.length : 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {audit && (
            <Card className="animate-fade-in">
              <CardHeader>
                <CardTitle>Audit report</CardTitle>
                <CardDescription>Before/after comparison results</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="mb-4 flex flex-wrap gap-4">
                  <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
                    <span className="text-sm text-muted-foreground">Files deleted:</span>
                    <span className="font-semibold text-destructive">{audit.files_deleted}</span>
                  </div>
                  <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
                    <span className="text-sm text-muted-foreground">Renamed/moved:</span>
                    <span className="font-semibold text-primary">{audit.files_renamed}</span>
                  </div>
                  <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
                    <span className="text-sm text-muted-foreground">Albums with holes:</span>
                    <span className="font-semibold text-warning">{audit.albums_with_holes.length}</span>
                  </div>
                </div>
                {audit.albums_with_holes.length > 0 && (
                  <div className="rounded-lg border border-warning/30 bg-warning/5 p-4">
                    <p className="mb-3 text-sm font-medium text-warning">Albums with missing tracks</p>
                    <div className="space-y-2">
                      {audit.albums_with_holes.map((album, i) => (
                        <div key={i} className="text-sm">
                          <span className="font-medium text-foreground">
                            {album.artist} – {album.album}
                          </span>
                          <span className="ml-2 text-muted-foreground">
                            {(album.total_tracks ?? album.after_count) ?? '?'} tracks (missing: {album.missing_tracks?.join(', ') ?? ''})
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
