import type { FinancialSummaryViewModel } from '@/demo/types'
import { formatCurrency } from '@/lib/format'
import { varianceClass } from '@/lib/budgetViewModel'
import { cn } from '@/lib/utils'

export function BudgetSummaryCards({
  summary,
}: {
  summary: FinancialSummaryViewModel
}) {
  return (
    <div className="mb-10 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <div className="rounded-lg border border-border bg-card p-3">
        <p className="text-xs font-medium text-muted-foreground">Budget</p>
        <p className="mt-1 text-xl font-bold">
          {formatCurrency(summary.selected_budget_amount_ttc)}
        </p>
      </div>
      <div className="rounded-lg border border-border bg-card p-3">
        <p className="text-xs font-medium text-muted-foreground">Facturé</p>
        <p className="mt-1 text-xl font-bold">
          {formatCurrency(summary.actual_cost_amount_ttc)}
        </p>
      </div>
      <div className="rounded-lg border border-border bg-card p-3">
        <p className="text-xs font-medium text-muted-foreground">Payé</p>
        <p className="mt-1 text-xl font-bold text-success">
          {formatCurrency(summary.paid_invoice_amount_ttc)}
        </p>
      </div>
      <div className="rounded-lg border border-border bg-card p-3">
        <p className="text-xs font-medium text-muted-foreground">Écart</p>
        <p
          className={cn(
            'mt-1 text-xl font-bold',
            varianceClass(summary.selected_budget_variance_ttc),
          )}
        >
          {formatCurrency(summary.selected_budget_variance_ttc)}
        </p>
      </div>
    </div>
  )
}
