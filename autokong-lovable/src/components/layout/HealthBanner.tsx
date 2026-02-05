import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { HealthCheck } from '@/types/autokong';

interface HealthBannerProps {
  health: HealthCheck | null;
  loading?: boolean;
}

export function HealthBanner({ health, loading }: HealthBannerProps) {
  if (loading) {
    return (
      <div className="flex h-10 items-center justify-center border-b border-border bg-muted/30">
        <span className="text-sm text-muted-foreground">Checking system health...</span>
      </div>
    );
  }

  if (!health) {
    return null;
  }

  const failedChecks = Object.entries(health)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  const allOk = failedChecks.length === 0;

  return (
    <div
      className={cn(
        'flex h-10 items-center gap-2 border-b px-6 text-sm transition-colors',
        allOk
          ? 'border-success/20 bg-success/5 text-success'
          : 'border-warning/20 bg-warning/5 text-warning'
      )}
    >
      {allOk ? (
        <>
          <CheckCircle2 className="h-4 w-4" />
          <span>All systems operational</span>
        </>
      ) : (
        <>
          <AlertTriangle className="h-4 w-4" />
          <span>
            Warning: Some paths or files are inaccessible
            <span className="ml-2 font-mono text-xs opacity-80">
              ({failedChecks.join(', ')})
            </span>
          </span>
        </>
      )}
    </div>
  );
}
