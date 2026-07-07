import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'

import { invalidateBudgetWorkspaceQueries } from '@/api/budget-workspace-cache'
import { getApiErrorMessage } from '@/api/client'
import { useDeleteBudgetLineTransactionMutation } from '@/api/transactions'
import { Button } from '@/components/ui/button'
import type { TransactionDeleteState } from '@/components/budget/types'
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 px-4 py-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-transaction-title"
    >
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 text-foreground shadow-lg">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-destructive/10 text-destructive">
            <Trash2 className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p
              id="delete-transaction-title"
              className="font-heading text-xl font-semibold"
            >
              Supprimer cette transaction ?
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Cette transaction sera supprimée du budget. Les totaux du projet
              seront recalculés depuis le backend.
            </p>
            <div className="mt-4 rounded-md border border-border bg-background px-3 py-2 text-sm">
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
            </div>
            {error ? (
              <p className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={deleteTransactionMutation.isPending}
          >
            Annuler
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={deleteTransactionMutation.isPending}
          >
            {deleteTransactionMutation.isPending
              ? 'Suppression...'
              : 'Supprimer'}
          </Button>
        </div>
      </div>
    </div>
  )
}
