import { NavLink, useLocation } from 'react-router-dom';
import { Play, History, Calendar, Settings, Music2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export const navItems = [
  { path: '/', label: 'Run', icon: Play },
  { path: '/history', label: 'History', icon: History },
  { path: '/schedule', label: 'Schedule', icon: Calendar },
  { path: '/config', label: 'SongKong Config', icon: Settings },
];

export function Sidebar() {
  const location = useLocation();

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 border-r border-sidebar-border bg-sidebar">
      <div className="flex h-full flex-col">
        {/* Logo */}
        <div className="flex h-16 items-center gap-3 border-b border-sidebar-border px-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <Music2 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Autokong</h1>
            <p className="text-xs text-muted-foreground">Music Library Orchestrator</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 px-3 py-4">
          <p className="section-header px-3">Navigation</p>
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200',
                  isActive
                    ? 'bg-sidebar-accent text-primary'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-foreground'
                )}
              >
                <item.icon className={cn('h-4 w-4', isActive && 'text-primary')} />
                {item.label}
                {isActive && (
                  <div className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="border-t border-sidebar-border p-4">
          <p className="text-xs text-muted-foreground">
            SongKong + Plex Orchestration
          </p>
        </div>
      </div>
    </aside>
  );
}
