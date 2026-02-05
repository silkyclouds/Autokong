import { ReactNode } from 'react';
import { Menu } from 'lucide-react';
import { Sidebar, navItems } from './Sidebar';
import { RunStatusBar } from './RunStatusBar';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="min-h-screen bg-background flex flex-col lg:flex-row">
      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <Sidebar />
      </div>

      {/* Main area */}
      <div className="flex-1 min-w-0 lg:ml-64">
        {/* Mobile header with hamburger */}
        <header className="flex h-14 items-center justify-between border-b border-border bg-background px-4 lg:hidden">
          <div className="flex items-center gap-2">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Open navigation menu">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="p-0">
                <SheetHeader className="border-b border-sidebar-border px-6 py-4 text-left">
                  <SheetTitle className="text-base">Autokong</SheetTitle>
                </SheetHeader>
                <nav className="flex flex-col space-y-1 px-3 py-4">
                  {navItems.map((item) => (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      className={({ isActive }) =>
                        cn(
                          'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                          isActive
                            ? 'bg-sidebar-accent text-primary'
                            : 'text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-foreground',
                        )
                      }
                    >
                      <item.icon className="h-4 w-4" />
                      {item.label}
                    </NavLink>
                  ))}
                </nav>
              </SheetContent>
            </Sheet>
            <span className="text-sm font-semibold text-foreground">Autokong</span>
          </div>
        </header>

        <RunStatusBar />
        <main className="min-h-[calc(100vh-2.5rem)] w-full max-w-full overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
