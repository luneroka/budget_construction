import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import {
  invalidateBudgetWorkspaceQueries,
  invalidateDocumentQueries,
} from '@/api/budget-workspace-cache'
import { getApiErrorMessage } from '@/api/client'
import { trashQueryKeys } from '@/api/trash'
import { useDeleteBudgetLineTransactionMutation } from '@/api/transactions'
import type { TransactionDeleteState } from '@/components/budget/types'
import { ConfirmationDialog } from '@/components/shared/ConfirmationDialog'
import { formatCurrency, formatDate } from '@/lib/format'
import { notifyError, notifySuccess } from '@/lib/toasts'

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
  const productName = product.product_name.trim()
  const budgetLineName = budgetLine.name.trim()
  const budgetContextLabel =
    productName.toLocaleLowerCase() === budgetLineName.toLocaleLowerCase()
      ? product.product_name
      : `${product.product_name} · ${budgetLine.name}`
  const hasAttachedDocument = transaction.document_state === 'attached'
  const deleteDescription = hasAttachedDocument
    ? 'Cette transaction sera placée dans la corbeille. Les documents joints y seront aussi déplacés.'
    : 'Cette transaction sera placée dans la corbeille.'
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
      invalidateDocumentQueries(queryClient, transactionId)
      void queryClient.invalidateQueries({
        queryKey: trashQueryKeys.projectList(projectId),
      })
      notifySuccess('Transaction déplacée dans la corbeille.')
      onConfirm()
    } catch (deleteError) {
      const message = getApiErrorMessage(deleteError)
      setError(message)
      notifyError(`Impossible de supprimer la transaction. ${message}`)
    }
  }

  return (
    <ConfirmationDialog
      title="Supprimer cette transaction ?"
      description={deleteDescription}
      error={error}
      isPending={deleteTransactionMutation.isPending}
      onCancel={onCancel}
      onConfirm={handleConfirm}
    >
      <p className="font-medium text-foreground">
        {transaction.supplier_name ?? 'Autoconstruction'}
      </p>
      <p className="mt-1 text-muted-foreground">{budgetContextLabel}</p>
      <p className="mt-1 text-muted-foreground">
        {formatDate(transaction.issued_date)} ·{' '}
        {formatCurrency(transaction.amount_ttc)}
      </p>
    </ConfirmationDialog>
  )
}
