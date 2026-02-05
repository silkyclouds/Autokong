import { useState } from 'react';
import { Play, Folder, FileCheck, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/shared/Card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/shared/Select';
import { Checkbox } from '@/components/shared/Checkbox';
import { Terminal } from '@/components/shared/Terminal';
import { StatusBadge } from '@/components/shared/StatusBadge';
import type { PipelineStep, RunScope, RunSummary, AuditResult } from '@/types/autokong';

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
      { id: 'final_clash_cleanup', label: 'Final clash cleanup' },
    ],
  },
  {
    label: 'Cleanup & Plex',
    steps: [
      { id: 'autoclean_empty', label: 'Auto-clean empty folders' },
      { id: 'remove_incomplete', label: 'Remove incomplete' },
      { id: 'plex_scans', label: 'Plex scans' },
      { id: 'plex_trash', label: 'Plex trash' },
    ],
  },
];

const allSteps = stepGroups.flatMap((g) => g.steps.map((s) => s.id));

// Mock data for preview
const mockFolders = [
  '/music/incoming/2024-01-15',
  '/music/incoming/2024-01-16',
  '/music/incoming/2024-01-17',
];

export function RunPage() {
  const [scope, setScope] = useState<RunScope>('daily');
  const [selectedSteps, setSelectedSteps] = useState<Set<PipelineStep>>(new Set(allSteps));
  const [finalChecks, setFinalChecks] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isLaunching, setIsLaunching] = useState(false);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [summary, setSummary] = useState<RunSummary | null>(null);
  const [audit, setAudit] = useState<AuditResult | null>(null);

  const toggleStep = (step: PipelineStep) => {
    const newSteps = new Set(selectedSteps);
    if (newSteps.has(step)) {
      newSteps.delete(step);
    } else {
      newSteps.add(step);
    }
    setSelectedSteps(newSteps);
  };

  const handleLaunch = async () => {
    setIsLaunching(true);
    setSummary(null);
    setAudit(null);
    setLogLines([]);

    // Simulate launch delay
    await new Promise((r) => setTimeout(r, 1000));
    setIsLaunching(false);
    setIsRunning(true);

    // Simulate log output
    const mockLogs = [
      '[INFO] Starting pipeline run...',
      `[INFO] Scope: ${scope}`,
      `[INFO] Steps: ${Array.from(selectedSteps).join(', ')}`,
      '[INFO] Scanning folders...',
      '[INFO] Found 3 folders to process',
      '[INFO] Processing /music/incoming/2024-01-15...',
      '[INFO] Running MusicBrainz identification...',
      '[INFO] Matched 45 tracks',
      '[INFO] Processing /music/incoming/2024-01-16...',
      '[INFO] Running delete duplicates...',
      '[INFO] Removed 3 duplicate files',
      '[INFO] Processing /music/incoming/2024-01-17...',
      '[INFO] Running rename operation...',
      '[INFO] Renamed 12 files',
      '[SUCCESS] Pipeline complete',
    ];

    for (let i = 0; i < mockLogs.length; i++) {
      await new Promise((r) => setTimeout(r, 300));
      setLogLines((prev) => [...prev, mockLogs[i]]);
    }

    setIsRunning(false);
    setSummary({
      status: 'ok',
      steps_run: Array.from(selectedSteps),
      duration_seconds: 45,
      folders_processed: 3,
    });

    if (finalChecks) {
      setAudit({
        files_deleted: 3,
        files_renamed: 12,
        albums_with_holes: [
          {
            artist: 'Pink Floyd',
            album: 'The Dark Side of the Moon',
            total_tracks: 10,
            missing_tracks: [3, 7],
          },
        ],
      });
    }
  };

  return (
    <div className="px-4 py-6 sm:p-8">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-xl sm:text-2xl font-semibold text-foreground">Launch a run</h1>
        <p className="mt-1 text-muted-foreground">
          Configure and launch a pipeline run to process your music library
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Configuration panel */}
        <div className="space-y-6 lg:col-span-1">
          {/* Scope selection */}
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

              {/* Preview */}
              <div className="mt-4 rounded-lg border border-border bg-muted/30 p-3">
                <p className="text-sm font-medium text-foreground">
                  {mockFolders.length} folder(s) will be processed
                </p>
                <div className="mt-2 max-h-24 overflow-y-auto">
                  {mockFolders.map((folder, i) => (
                    <p key={i} className="truncate font-mono text-xs text-muted-foreground">
                      {folder}
                    </p>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Steps selection */}
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
                    <p className="text-xs text-muted-foreground">
                      Before/after mapping comparison
                    </p>
                  </div>
                </label>
              </div>
            </CardContent>
          </Card>

          {/* Launch button */}
          <Button
            className="w-full"
            size="lg"
            onClick={handleLaunch}
            disabled={isLaunching || isRunning || selectedSteps.size === 0}
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

        {/* Output panel */}
        <div className="space-y-6 lg:col-span-2 min-w-0">
          {/* Log output */}
          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Run output
                {isRunning && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                    Live
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Terminal lines={logLines} maxHeight="320px" />
            </CardContent>
          </Card>

          {/* Summary */}
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
                      <StatusBadge status={summary.status} />
                    </div>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/30 p-4">
                    <p className="text-xs text-muted-foreground">Duration</p>
                    <p className="mt-1 text-xl font-semibold">{summary.duration_seconds}s</p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/30 p-4">
                    <p className="text-xs text-muted-foreground">Folders processed</p>
                    <p className="mt-1 text-xl font-semibold">{summary.folders_processed}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/30 p-4">
                    <p className="text-xs text-muted-foreground">Steps run</p>
                    <p className="mt-1 text-xl font-semibold">{summary.steps_run.length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Audit */}
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
                            {album.total_tracks} tracks (missing: {album.missing_tracks.join(', ')})
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
