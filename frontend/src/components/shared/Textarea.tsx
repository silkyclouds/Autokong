import * as React from 'react';
import { cn } from '@/lib/utils';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          'flex min-h-[120px] w-full rounded-lg border border-border bg-input px-3 py-2 text-sm font-mono',
          'placeholder:text-muted-foreground',
          'focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2 focus:ring-offset-background',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'transition-colors hover:border-primary/30',
          'resize-y',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Textarea.displayName = 'Textarea';

export { Textarea };
