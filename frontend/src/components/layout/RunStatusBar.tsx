import { useState, useEffect, useRef } from 'react';
import { Loader2, Container } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import * as api from '@/lib/api';
import { cn } from '@/lib/utils';

export function RunStatusBar() {
  const [current, setCurrent] = useState<{
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
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const fetchCurrent = () => {
      api.getJobCurrent().then(setCurrent).catch(() => setCurrent({ job_id: null })).finally(() => setLoading(false));
    };
    fetchCurrent();
    intervalRef.current = setInterval(fetchCurrent, 2000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
    };
  }, []);

  if (loading && !current) {
    return (
      <div className="flex h-10 items-center justify-center border-b border-border bg-muted/30">
        <span className="text-sm text-muted-foreground">Loading...</span>
      </div>
    );
  }

  const jobId = current?.job_id ?? null;
  const progress = current?.progress;

  if (!jobId) {
    return (
      <div className="flex h-10 items-center justify-center border-b border-border bg-muted/30 px-6 text-sm text-muted-foreground">
        No run in progress
      </div>
    );
  }

  const total = progress?.total ?? 1;
  const stepIndex = (progress?.current ?? 0) + 1;
  const pct = total ? (stepIndex / total) * 100 : 0;

  return (
    <div
      className={cn(
        'flex h-10 min-h-10 items-center gap-4 border-b border-primary/20 bg-primary/5 px-6 text-sm transition-colors'
      )}
    >
      <div className="flex items-center gap-2 text-primary font-medium">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Run in progress</span>
      </div>
      <div className="flex flex-1 items-center gap-4">
        <div className="w-32 shrink-0 text-muted-foreground">
          Step {stepIndex} of {total}
        </div>
        <div className="flex-1 max-w-[240px]">
          <Progress value={pct} className="h-2" />
        </div>
        <span className="shrink-0 text-muted-foreground">{progress?.step_label ?? '…'}</span>
        {progress?.container_name && (
          <span className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 font-mono text-xs">
            <Container className="h-3 w-3" />
            {progress.container_name}
          </span>
        )}
      </div>
    </div>
  );
}
