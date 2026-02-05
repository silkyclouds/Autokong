import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface CardProps {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
}

interface CardHeaderProps {
  children: ReactNode;
  className?: string;
}

interface CardTitleProps {
  children: ReactNode;
  className?: string;
}

interface CardDescriptionProps {
  children: ReactNode;
  className?: string;
}

interface CardContentProps {
  children: ReactNode;
  className?: string;
}

export function Card({ children, className, interactive }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-card p-6',
        interactive && 'card-interactive cursor-pointer',
        className
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className }: CardHeaderProps) {
  return <div className={cn('mb-4', className)}>{children}</div>;
}

export function CardTitle({ children, className }: CardTitleProps) {
  return (
    <h3 className={cn('text-lg font-semibold text-foreground', className)}>
      {children}
    </h3>
  );
}

export function CardDescription({ children, className }: CardDescriptionProps) {
  return (
    <p className={cn('mt-1 text-sm text-muted-foreground', className)}>
      {children}
    </p>
  );
}

export function CardContent({ children, className }: CardContentProps) {
  return <div className={className}>{children}</div>;
}
