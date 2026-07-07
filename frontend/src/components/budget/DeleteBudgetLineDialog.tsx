import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { invalidateBudgetWorkspaceQueries } from '@/api/budget-workspace-cache'
import { useDeleteBudgetLineMutation } from '@/api/budget-lines'
import { getApiErrorMessage } from '@/api/client'
import type { BudgetLineDeleteState } from '@/components/budget/types'
import { ConfirmationDialog } from '@/components/shared/ConfirmationDialog'
import { formatCurrency } from '@/lib/format'

export function DeleteBudgetLineDialog({
  context,
  projectId,
  onCancel,
  onConfirm,
}: {
  context: BudgetLineDeleteState
  projectId: number
  onCancel: () => void
  onConfirm: () => void
}) {
  const queryClient = useQueryClient()
  const deleteBudgetLineMutation = useDeleteBudgetLineMutation()
  const [error, setError] = useState<string | null>(null)
  const { line, product } = context
  const budgetLineId = Number(line.budget_line_id)
  const transactionCount =
    line.quote_count + line.diy_estimate_count + line.invoice_count
  const canDelete = Number.isInteger(projectId) && Number.isInteger(budgetLineId)

  async function handleConfirm() {
    if (!canDelete) {
      setError('Identifiant de sous-produit invalide.')
      return
    }

    try {
      setError(null)
      await deleteBudgetLineMutation.mutateAsync({
        projectId,
        budgetLineId,
      })
      invalidateBudgetWorkspaceQueries(queryClient, projectId, budgetLineId)
      onConfirm()
    } catch (deleteError) {
      setError(getApiErrorMessage(deleteError))
    }
  }

  return (
    <ConfirmationDialog
      title="Supprimer ce sous-produit ?"
      description="Ce sous-produit et ses transactions seront supprimés du budget. Les totaux du projet seront recalculés depuis le backend."
      error={error}
      isPending={deleteBudgetLineMutation.isPending}
      onCancel={onCancel}
      onConfirm={handleConfirm}
    >
      <p className="font-medium text-foreground">{line.name}</p>
      <p className="mt-1 text-muted-foreground">{product.product_name}</p>
      <p className="mt-1 text-muted-foreground">
        {transactionCount} transaction{transactionCount > 1 ? 's' : ''} ·
        Budget {formatCurrency(line.selected_budget_amount_ttc)}
      </p>
    </ConfirmationDialog>
  )
}
