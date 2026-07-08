import type { LucideIcon } from 'lucide-react'
import {
  ArrowLeftRight,
  FileText,
  LayoutDashboard,
  CircleDollarSign,
  Settings,
  Users,
} from 'lucide-react'
import { NavLink } from 'react-router-dom'

type SidebarItem = {
  label: string
  to: string
  icon: LucideIcon
  end?: boolean
}

const primaryItems: SidebarItem[] = [
  { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard },
  { label: 'Budget', to: '/budget', icon: CircleDollarSign },
  { label: 'Transactions', to: '/transactions', icon: ArrowLeftRight },
  { label: 'Fournisseurs', to: '/suppliers', icon: Users },
  { label: 'Documents', to: '/documents', icon: FileText },
]

const secondaryItems: SidebarItem[] = [
  { label: 'Paramètres', to: '/settings', icon: Settings },
]

function navClassName({ isActive }: { isActive: boolean }) {
  return [
    'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors',
    isActive
      ? 'bg-sidebar-accent text-gold font-medium border-l-2 border-gold'
      : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
  ].join(' ')
}

function SidebarSection({ items }: { items: SidebarItem[] }) {
  return (
    <div className="space-y-1">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={navClassName}
        >
          <item.icon className="h-4 w-4" aria-hidden="true" />
          <span>{item.label}</span>
        </NavLink>
      ))}
    </div>
  )
}

export function SidebarNav() {
  return (
    <nav className="flex-1 space-y-4 p-3">
      <SidebarSection items={primaryItems} />
      <div className="-mx-3 border-t border-sidebar-border px-3 pt-4">
        <SidebarSection items={secondaryItems} />
      </div>
    </nav>
  )
}
