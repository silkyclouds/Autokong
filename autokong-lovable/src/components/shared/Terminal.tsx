import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface TerminalProps {
  lines: string[];
  className?: string;
  maxHeight?: string;
}

export function Terminal({ lines, className, maxHeight = '400px' }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [lines]);

  return (
    <div
      ref={containerRef}
      className={cn(
        'terminal overflow-auto p-4',
        className
      )}
      style={{ maxHeight }}
    >
      {lines.length === 0 ? (
        <p className="text-muted-foreground">Waiting for output...</p>
      ) : (
        lines.map((line, index) => (
          <div key={index} className="terminal-text text-sm leading-relaxed">
            <span className="mr-2 select-none text-muted-foreground">{String(index + 1).padStart(3, ' ')}│</span>
            {line}
          </div>
        ))
      )}
    </div>
  );
}
