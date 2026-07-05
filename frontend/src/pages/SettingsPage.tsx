import { PageHeader } from '@/components/shared/PageHeader'
import { SectionCard } from '@/components/shared/SectionCard'

export function SettingsPage() {
  return (
    <section>
      <PageHeader
        eyebrow="Configuration"
        title="Parametres"
        description="Point d'entree pour les reglages, le catalogue et les modeles de projet."
      />
      <div className="grid gap-4 md:grid-cols-2">
        <SectionCard title="Catalogue">
          <p className="text-sm text-muted-foreground">
            Categories, sous-categories et produits.
          </p>
        </SectionCard>
        <SectionCard title="Modeles">
          <p className="text-sm text-muted-foreground">
            Perimetres de produits utilises a la creation d'un projet.
          </p>
        </SectionCard>
      </div>
    </section>
  )
}
