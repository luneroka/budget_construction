import { ReceiptText } from 'lucide-react'

import { PageHeader } from '@/components/shared/PageHeader'
import { ProgressBar } from '@/components/shared/ProgressBar'
import { SectionCard } from '@/components/shared/SectionCard'
import { StatusBadge } from '@/components/shared/StatusBadge'

export function BudgetPage() {
  return (
    <section>
      <PageHeader
        eyebrow="Workspace"
        title="Budget"
        description="Espace operationnel pour parcourir categories, produits, lignes de budget et transactions du projet selectionne."
      />
      <SectionCard
        title="Hierarchie budget"
        description="Category > Product > Budget Line > Transactions."
        icon={ReceiptText}
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status="product" />
            <StatusBadge status="breakdown" />
            <StatusBadge status="validated" />
          </div>
          <ProgressBar value={48} label="Avancement facture" tone="primary" />
        </div>
      </SectionCard>
    </section>
  )
}
