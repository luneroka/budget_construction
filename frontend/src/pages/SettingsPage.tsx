import { FileSpreadsheet, FolderKanban, SlidersHorizontal } from 'lucide-react'
import { Link } from 'react-router-dom'

import { PageHeader } from '@/components/shared/PageHeader'
import { SectionCard } from '@/components/shared/SectionCard'

export function SettingsPage() {
  return (
    <section>
      <PageHeader
        title="Paramètres"
        description="Gestion des paramètres de l'application et des projets."
      />
      <div className="grid gap-4 md:grid-cols-2">
        <SectionCard
          title="Paramètres généraux"
          description="Réglages de l'application."
          icon={SlidersHorizontal}
        >
          <p className="text-sm text-muted-foreground">
            Cette section sera complétée ultérieurement.
          </p>
        </SectionCard>
        <Link
          to="/settings/projects"
          className="block rounded-lg transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <SectionCard
            title="Projets"
            description="Gestion des projets."
            icon={FolderKanban}
          >
            <p className="text-sm font-medium text-primary">
              Ouvrir la gestion des projets
            </p>
          </SectionCard>
        </Link>
        <Link
          to="/settings/exports"
          className="block rounded-lg transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <SectionCard
            title="Exports"
            description="Fichiers comptables et rapports du projet."
            icon={FileSpreadsheet}
          >
            <p className="text-sm font-medium text-primary">
              Ouvrir les exports
            </p>
          </SectionCard>
        </Link>
      </div>
    </section>
  )
}
