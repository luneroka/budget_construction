import { LogOut } from 'lucide-react'
import { Outlet } from 'react-router-dom'

import { useAuth } from '@/auth/authContext'
import { Button } from '@/components/ui/button'
import { ProjectSwitcher } from './ProjectSwitcher'
import { SidebarNav } from './SidebarNav'

export function AppLayout() {
  const { logout, user } = useAuth()
  const initials =
    user?.name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || 'U'

  return (
    <div className="min-h-screen flex font-body">
      <aside className="w-58 bg-sidebar text-sidebar-foreground flex flex-col  shrink-0 sticky top-0 h-screen">
        <ProjectSwitcher />
        <SidebarNav />
        <div className="border-t border-sidebar-border p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sidebar-accent text-xs font-semibold text-gold">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {user?.name ?? 'Utilisateur'}
              </p>
              <p className="truncate text-xs text-sidebar-foreground/60">
                {user?.email ?? 'Session active'}
              </p>
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 shrink-0 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
              aria-label="Se deconnecter"
              onClick={logout}
            >
              <LogOut aria-hidden />
            </Button>
          </div>
        </div>
      </aside>

      <main className="flex-1 bg-background">
        <div className="p-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
