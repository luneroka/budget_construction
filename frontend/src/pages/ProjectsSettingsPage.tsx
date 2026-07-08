import { PageHeader } from '@/components/shared/PageHeader'
import { SettingsBackButton } from '@/components/shared/SettingsBackButton'

export function ProjectsSettingsPage() {
  return (
    <section>
      <SettingsBackButton />
      <PageHeader title="Projets" description="Gestion des projets." />
    </section>
  )
}
