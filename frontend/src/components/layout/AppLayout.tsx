import { Outlet } from 'react-router-dom'

import { ProjectSwitcher } from './ProjectSwitcher'
import { SidebarNav } from './SidebarNav'

export function AppLayout() {
  return (
    <div className="min-h-screen flex font-body">
      <aside className="w-64 bg-sidebar text-sidebar-foreground flex flex-col  shrink-0 sticky top-0 h-screen">
        <ProjectSwitcher />
        <SidebarNav />
        <div className="border-t border-sidebar-border p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sidebar-accent text-xs font-semibold text-gold">
              YR
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">Yoann Robert</p>
              <p className="truncate text-xs text-sidebar-foreground/60">
                Administrateur
              </p>
            </div>
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
