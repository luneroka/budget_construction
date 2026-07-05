import { ReceiptText } from 'lucide-react'

import { PageHeader } from '@/components/shared/PageHeader'
import { ProgressBar } from '@/components/shared/ProgressBar'
import { SectionCard } from '@/components/shared/SectionCard'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { budgetWorkspaceViewModel } from '@/demo/demo-data'
import { formatCurrency, formatProgress } from '@/lib/format'

export function BudgetPage() {
  const firstCategory = budgetWorkspaceViewModel.categories[0]
  const firstProduct = firstCategory?.products[0]
  const firstBudgetLine = firstProduct?.budget_lines[0]

  return (
    <section>
      <PageHeader
        eyebrow="Workspace"
        title="Budget"
        description={`${budgetWorkspaceViewModel.categories.length} categories, ${budgetWorkspaceViewModel.financialSummary.products.length} produits et ${budgetWorkspaceViewModel.transactions.length} transactions derives des seeds backend.`}
      />
      <SectionCard
        title={firstCategory?.category_name ?? 'Hierarchie budget'}
        description={
          firstProduct
            ? `${firstProduct.product_name} > ${firstBudgetLine?.name ?? 'Budget line'}`
            : 'Category > Product > Budget Line > Transactions.'
        }
        icon={ReceiptText}
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status="product" />
            {firstBudgetLine?.selected_budget_transaction_id ? (
              <StatusBadge status="validated" />
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground">
            Budget selectionne:{' '}
            {formatCurrency(firstBudgetLine?.selected_budget_amount_ttc ?? 0)} ·
            facture: {formatCurrency(firstBudgetLine?.actual_cost_amount_ttc ?? 0)}
          </p>
          <ProgressBar
            value={formatProgress(
              firstBudgetLine?.actual_cost_amount_ttc ?? 0,
              firstBudgetLine?.selected_budget_amount_ttc ?? 0,
            )}
            label="Avancement facture"
            tone="primary"
          />
        </div>
      </SectionCard>
    </section>
  )
}
