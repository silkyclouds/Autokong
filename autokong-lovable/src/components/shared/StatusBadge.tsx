import { cn } from '@/lib/utils';
import { CheckCircle2, XCircle, AlertCircle, Loader2 } from 'lucide-react';
import type { RunStatus } from '@/types/autokong';

interface StatusBadgeProps {
  status: RunStatus;
  className?: string;
}

const statusConfig: Record<RunStatus, { label: string; className: string; icon: typeof CheckCircle2 }> = {
  ok: {
    label: 'Completed',
    className: 'status-ok',
    icon: CheckCircle2,
  },
  error: {
    label: 'Error',
    className: 'status-error',
    icon: XCircle,
  },
  no_folders: {
    label: 'No folders',
    className: 'status-warning',
    icon: AlertCircle,
  },
  running: {
    label: 'Running',
    className: 'status-running',
    icon: Loader2,
  },
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
        config.className,
        className
      )}
    >
      <Icon className={cn('h-3 w-3', status === 'running' && 'animate-spin')} />
      {config.label}
    </span>
  );
}
