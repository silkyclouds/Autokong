import { useState } from 'react';
import { History, Eye, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/shared/Card';
import { StatusBadge } from '@/components/shared/StatusBadge';
import type { HistoryEntry, AuditResult } from '@/types/autokong';

// Mock history data
const mockHistory: HistoryEntry[] = [
  {
    id: '1',
    started_at: '2024-01-17T03:00:00Z',
    finished_at: '2024-01-17T03:12:45Z',
    scope: 'daily',
    status: 'ok',
    has_audit: true,
  },
  {
    id: '2',
    started_at: '2024-01-16T03:00:00Z',
    finished_at: '2024-01-16T03:08:22Z',
    scope: 'daily',
    status: 'ok',
    has_audit: true,
  },
  {
    id: '3',
    started_at: '2024-01-15T03:00:00Z',
    finished_at: '2024-01-15T03:05:11Z',
    scope: 'daily',
    status: 'no_folders',
    has_audit: false,
  },
  {
    id: '4',
    started_at: '2024-01-14T03:00:00Z',
    finished_at: '2024-01-14T03:15:33Z',
    scope: 'monthly',
    status: 'error',
    has_audit: false,
  },
  {
    id: '5',
    started_at: '2024-01-13T03:00:00Z',
    finished_at: null,
    scope: 'all_days',
    status: 'running',
    has_audit: false,
  },
];

const mockAudit: AuditResult = {
  files_deleted: 15,
  files_renamed: 48,
  albums_with_holes: [
    {
      artist: 'Radiohead',
      album: 'OK Computer',
      total_tracks: 12,
      missing_tracks: [5, 8],
    },
    {
      artist: 'Daft Punk',
      album: 'Random Access Memories',
      total_tracks: 13,
      missing_tracks: [11],
    },
  ],
};

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

export function HistoryPage() {
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [audit, setAudit] = useState<AuditResult | null>(null);

  const handleViewAudit = (entry: HistoryEntry) => {
    if (entry.has_audit) {
      setSelectedRunId(entry.id);
      setAudit(mockAudit);
    }
  };

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-foreground">History</h1>
        <p className="mt-1 text-muted-foreground">
          View past pipeline runs and their audit reports
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* History list */}
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
                        Status
                      </th>
                      <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {mockHistory.map((entry) => (
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
                        <td className="py-4 text-sm">{scopeLabels[entry.scope]}</td>
                        <td className="py-4">
                          <StatusBadge status={entry.status} />
                        </td>
                        <td className="py-4 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleViewAudit(entry)}
                            disabled={!entry.has_audit}
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
                              Missing: {album.missing_tracks.join(', ')}
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
