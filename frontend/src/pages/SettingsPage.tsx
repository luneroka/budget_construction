import { PageHeader } from '@/components/shared/PageHeader'
import { SectionCard } from '@/components/shared/SectionCard'
import { budgetWorkspaceViewModel, templateViewModels } from '@/demo/demo-data'

export function SettingsPage() {
  return (
    <section>
      <PageHeader
        title="Parametres"
        description="Point d'entree pour les reglages, le catalogue et les modeles de projet."
      />
      <div className="grid gap-4 md:grid-cols-2">
        <SectionCard title="Catalogue">
          <p className="text-sm text-muted-foreground">
            {budgetWorkspaceViewModel.categories.length} categories et{' '}
            {budgetWorkspaceViewModel.financialSummary.products.length} produits.
          </p>
        </SectionCard>
        <SectionCard title="Modeles">
          <p className="text-sm text-muted-foreground">
            {templateViewModels.map((template) => template.name).join(', ')}
          </p>
        </SectionCard>
      </div>
    </section>
  )
}
