import { useState, useEffect, useRef } from 'react';
import { History, Eye, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/shared/Card';
import { StatusBadge } from '@/components/shared/StatusBadge';
import * as api from '@/lib/api';
import type { HistoryEntry, AuditResult } from '@/types/autokong';

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const scopeLabels: Record<string, string> = {
  daily: 'Daily',
  monthly: 'Monthly',
  all_days: 'All days',
};

function mapApiAuditToResult(a: {
  summary?: { files_deleted_count?: number; files_renamed_or_moved_count?: number };
  albums_with_holes?: { artist: string; album: string; after_count?: number; missing_tracks?: number[] }[];
}): AuditResult {
  const sum = a.summary;
  const holes = a.albums_with_holes || [];
  return {
    files_deleted: sum?.files_deleted_count ?? 0,
    files_renamed: sum?.files_renamed_or_moved_count ?? 0,
    albums_with_holes: holes.map((h) => ({
      artist: h.artist,
      album: h.album,
      total_tracks: h.after_count,
      missing_tracks: h.missing_tracks || [],
    })),
  };
}

type HistoryRun = HistoryEntry & {
  summary?: { duration_seconds?: number; steps_run?: string[] } | null;
};

export function HistoryPage() {
  const [runs, setRuns] = useState<HistoryRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [audit, setAudit] = useState<AuditResult | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = () => {
    api.getHistory().then((list: { id: string; started_at: string; finished_at: string | null; scope: string; status: string; summary?: { duration_seconds?: number; steps_run?: string[] } | null }[]) => {
      setRuns(list.map((r) => ({
        id: r.id,
        started_at: r.started_at,
        finished_at: r.finished_at,
        scope: r.scope as HistoryEntry['scope'],
        status: r.status as HistoryEntry['status'],
        has_audit: r.status === 'ok' || r.status === 'error',
        summary: r.summary ?? null,
      })));
    }).catch((e) => setError(e.message)).finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const prevJobIdRef = useRef<string | null>(null);
  useEffect(() => {
    const t = setInterval(async () => {
      const cur = await api.getJobCurrent().catch(() => ({ job_id: null }));
      const hadJob = prevJobIdRef.current != null;
      if (hadJob && cur.job_id === null) {
        fetchHistory();
      }
      prevJobIdRef.current = cur.job_id ?? null;
    }, 4000);
    return () => clearInterval(t);
  }, []);

  const handleViewAudit = async (entry: HistoryEntry) => {
    setSelectedRunId(entry.id);
    setAudit(undefined);
    try {
      const a = await api.getJobAudit(entry.id);
      setAudit(mapApiAuditToResult(a as Parameters<typeof mapApiAuditToResult>[0]));
    } catch {
      setAudit(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center p-8">
        <p className="text-muted-foreground">Loading history…</p>
      </div>
    );
  }

  return (
    <div className="p-8">
      {error && (
        <div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-foreground">History</h1>
        <p className="mt-1 text-muted-foreground">
          View past pipeline runs and their audit reports
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="h-4 w-4 text-primary" />
                Recent runs
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="pb-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Started
                      </th>
                      <th className="pb-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Finished
                      </th>
                      <th className="pb-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Scope
                      </th>
                      <th className="pb-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Duration
                      </th>
                      <th className="pb-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Steps
                      </th>
                      <th className="pb-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Status
                      </th>
                      <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {runs.map((entry) => (
                      <tr
                        key={entry.id}
                        className={`transition-colors hover:bg-accent/30 ${
                          selectedRunId === entry.id ? 'bg-accent/50' : ''
                        }`}
                      >
                        <td className="py-4 font-mono text-sm">
                          {formatDate(entry.started_at)}
                        </td>
                        <td className="py-4 font-mono text-sm text-muted-foreground">
                          {entry.finished_at ? formatDate(entry.finished_at) : '–'}
                        </td>
                        <td className="py-4 text-sm">{scopeLabels[entry.scope] ?? entry.scope}</td>
                        <td className="py-4 text-sm text-muted-foreground">
                          {entry.summary?.duration_seconds != null ? `${entry.summary.duration_seconds}s` : '–'}
                        </td>
                        <td className="py-4 text-sm text-muted-foreground">
                          {entry.summary?.steps_run?.length ?? '–'}
                        </td>
                        <td className="py-4">
                          <StatusBadge status={entry.status} />
                        </td>
                        <td className="py-4 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleViewAudit(entry)}
                          >
                            <Eye className="mr-1 h-3 w-3" />
                            Audit
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Audit detail panel */}
        <div className="lg:col-span-1">
          <Card className="sticky top-8">
            <CardHeader>
              <CardTitle>Audit detail</CardTitle>
              <CardDescription>
                {selectedRunId
                  ? `Viewing audit for run #${selectedRunId}`
                  : 'Select a run to view its audit'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!selectedRunId ? (
                <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-border">
                  <p className="text-sm text-muted-foreground">No run selected</p>
                </div>
              ) : audit === undefined ? (
                <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-border">
                  <p className="text-sm text-muted-foreground">Loading audit…</p>
                </div>
              ) : audit ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-lg border border-border bg-muted/30 p-3 text-center">
                        <p className="text-2xl font-bold text-destructive">{audit.files_deleted}</p>
                        <p className="text-xs text-muted-foreground">Files deleted</p>
                      </div>
                      <div className="rounded-lg border border-border bg-muted/30 p-3 text-center">
                        <p className="text-2xl font-bold text-primary">{audit.files_renamed}</p>
                        <p className="text-xs text-muted-foreground">Files renamed</p>
                      </div>
                    </div>
                    {audit.albums_with_holes.length > 0 ? (
                      <div className="rounded-lg border border-warning/30 bg-warning/5 p-4">
                        <div className="mb-3 flex items-center gap-2 text-warning">
                          <AlertTriangle className="h-4 w-4" />
                          <span className="text-sm font-medium">
                            {audit.albums_with_holes.length} album(s) with holes
                          </span>
                        </div>
                        <div className="space-y-3">
                          {audit.albums_with_holes.map((album, i) => (
                            <div key={i} className="text-sm">
                              <p className="font-medium text-foreground">
                                {album.artist} – {album.album}
                              </p>
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                Missing: {album.missing_tracks?.join(', ') ?? ''}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-lg border border-success/30 bg-success/5 p-4 text-center">
                        <p className="text-sm text-success">No albums with missing tracks</p>
                      </div>
                    )}
                  </div>
              ) : (
                <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-border">
                  <p className="text-sm text-muted-foreground">Audit not available</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
