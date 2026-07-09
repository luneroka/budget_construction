import { LogOut, Menu, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'

import { useAuth } from '@/auth/authContext'
import { Button } from '@/components/ui/button'
import { ProjectSwitcher } from './ProjectSwitcher'
import { ReportIssueDrawer } from './ReportIssueDrawer'
import { SidebarNav } from './SidebarNav'

export function AppLayout() {
  const { logout, user } = useAuth()
  const location = useLocation()
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const initials =
    user?.name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || 'U'

  useEffect(() => {
    setIsSidebarOpen(false)
  }, [location.pathname])

  return (
    <div className="flex min-h-screen font-body">
      {isSidebarOpen ? (
        <button
          type="button"
          className="min-[1600px]:hidden fixed inset-0 z-30 bg-black/40"
          aria-label="Fermer le menu"
          onClick={() => setIsSidebarOpen(false)}
        />
      ) : null}

      <aside
        className={[
          'fixed inset-y-0 left-0 z-40 flex h-screen w-58 shrink-0 flex-col bg-sidebar text-sidebar-foreground shadow-xl transition-transform duration-200 ease-out min-[1600px]:sticky min-[1600px]:top-0 min-[1600px]:z-auto min-[1600px]:translate-x-0 min-[1600px]:shadow-none',
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full',
        ].join(' ')}
      >
        <div className="flex justify-end border-b border-sidebar-border px-3 py-2 min-[1600px]:hidden">
          <Button
            size="icon"
            variant="ghost"
            className="h-9 w-9 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
            aria-label="Fermer le menu"
            onClick={() => setIsSidebarOpen(false)}
          >
            <X aria-hidden />
          </Button>
        </div>
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

      <main className="min-w-0 flex-1 bg-background">
        <div className="sticky top-0 z-20 flex items-center border-b border-border bg-background/95 px-4 py-3 backdrop-blur min-[1600px]:hidden">
          <Button
            size="icon"
            variant="outline"
            className="h-9 w-9"
            aria-label="Ouvrir le menu"
            aria-expanded={isSidebarOpen}
            onClick={() => setIsSidebarOpen(true)}
          >
            <Menu aria-hidden />
          </Button>
        </div>
        <div className="p-4 sm:p-6 min-[1600px]:p-8">
          <Outlet />
        </div>
      </main>
      <ReportIssueDrawer />
    </div>
  )
}
