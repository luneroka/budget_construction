import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { invalidateBudgetWorkspaceQueries } from '@/api/budget-workspace-cache'
import { getApiErrorMessage } from '@/api/client'
import { useDeleteBudgetLineTransactionMutation } from '@/api/transactions'
import type { TransactionDeleteState } from '@/components/budget/types'
import { ConfirmationDialog } from '@/components/shared/ConfirmationDialog'
import { formatCurrency, formatDate } from '@/lib/format'

export function DeleteTransactionDialog({
  context,
  projectId,
  onCancel,
  onConfirm,
}: {
  context: TransactionDeleteState
  projectId: number
  onCancel: () => void
  onConfirm: () => void
}) {
  const queryClient = useQueryClient()
  const deleteTransactionMutation = useDeleteBudgetLineTransactionMutation()
  const [error, setError] = useState<string | null>(null)
  const { budgetLine, product, transaction } = context
  const budgetLineId = Number(budgetLine.budget_line_id)
  const transactionId = Number(transaction.id)
  const canDelete =
    Number.isInteger(projectId) &&
    Number.isInteger(budgetLineId) &&
    Number.isInteger(transactionId)

  async function handleConfirm() {
    if (!canDelete) {
      setError('Identifiant de transaction invalide.')
      return
    }

    try {
      setError(null)
      await deleteTransactionMutation.mutateAsync({
        projectId,
        budgetLineId,
        transactionId,
      })
      invalidateBudgetWorkspaceQueries(queryClient, projectId, budgetLineId)
      onConfirm()
    } catch (deleteError) {
      setError(getApiErrorMessage(deleteError))
    }
  }

  return (
    <ConfirmationDialog
      title="Supprimer cette transaction ?"
      description="Cette transaction sera supprimée du budget. Les totaux du projet seront recalculés depuis le backend."
      error={error}
      isPending={deleteTransactionMutation.isPending}
      onCancel={onCancel}
      onConfirm={handleConfirm}
    >
      <p className="font-medium text-foreground">
        {transaction.supplier_name ?? 'Autoconstruction'}
      </p>
      <p className="mt-1 text-muted-foreground">
        {product.product_name} · {budgetLine.name}
      </p>
      <p className="mt-1 text-muted-foreground">
        {formatDate(transaction.issued_date)} ·{' '}
        {formatCurrency(transaction.amount_ttc)}
      </p>
    </ConfirmationDialog>
  )
}
