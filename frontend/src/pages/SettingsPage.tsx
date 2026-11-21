import {
  FileSpreadsheet,
  FolderKanban,
  Layers,
  UserCog,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { Link } from 'react-router-dom'

import { useAuth } from '@/auth/authContext'

import { PageHeader } from '@/components/shared/PageHeader'
import { SectionCard } from '@/components/shared/SectionCard'
import { type SettingsEntryId, settingsEntries } from '@/lib/settingsEntries'

const entryIcons: Record<SettingsEntryId, LucideIcon> = {
  user: UserCog,
  projects: FolderKanban,
  exports: FileSpreadsheet,
  users: Users,
  lots: Layers,
}

export function SettingsPage() {
  const { user } = useAuth()

  return (
    <section>
      <PageHeader
        title="Paramètres"
        description="Gestion des paramètres de l'application et des projets."
      />
      <div className="grid gap-4 md:grid-cols-2">
        {settingsEntries(user?.is_admin ?? false).map((entry) => (
          <Link
            key={entry.id}
            to={entry.to}
            className="block rounded-lg transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <SectionCard
              title={entry.title}
              description={entry.description}
              icon={entryIcons[entry.id]}
            >
              <p className="text-sm font-medium text-primary">
                {entry.linkLabel}
              </p>
            </SectionCard>
          </Link>
        ))}
      </div>
    </section>
  )
}
