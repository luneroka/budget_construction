import { type SyntheticEvent, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Edit3 } from 'lucide-react'

import { invalidateBudgetWorkspaceQueries } from '@/api/budget-workspace-cache'
import { getApiErrorMessage } from '@/api/client'
import {
  useSelectBudgetCandidateMutation,
  useUnselectBudgetCandidateMutation,
  useUpdateBudgetLineTransactionMutation,
} from '@/api/transactions'
import { DeleteTransactionDialog } from '@/components/budget/DeleteTransactionDialog'
import {
  ModalCancelButton,
  ModalCloseButton,
  ModalDeleteButton,
  ModalSaveButton,
  ModalShell,
} from '@/components/shared/ModalShell'
import { formatDate } from '@/lib/format'
import { notifyError, notifySuccess } from '@/lib/toasts'
import type { InvoiceStatus, Project, QuoteStatus, Supplier } from '@/types'

import { TransactionDocumentsPanel } from './TransactionDocumentsPanel'
import { TransactionFormBody } from './TransactionFormBody'
import { BudgetSelectionRow } from './TransactionFormFields'
import {
  type TransactionUpdateFormState,
  type ViewedTransactionContext,
  buildTransactionUpdate,
  createInitialUpdateFormState,
  defaultPaymentDate,
  requiredId,
  transactionBreadcrumb,
  transactionTypeLabels,
} from './transactionForm'
import { useTransactionAmountForm } from './useTransactionAmountForm'

type TransactionReviewModalProps = {
  project: Project
  context: ViewedTransactionContext
  readOnly?: boolean
  suppliers: Supplier[]
  isBudgetSelected: boolean
  canToggleBudgetSelection: boolean
  onToggleBudgetSelection: () => void
  onClose: () => void
}

function isSameForm(
  left: TransactionUpdateFormState,
  right: TransactionUpdateFormState,
) {
  return (Object.keys(left) as (keyof TransactionUpdateFormState)[]).every(
    (key) => left[key] === right[key],
  )
}

// Opening a transaction opens it for editing: every field is live, so a
// status can be changed in two clicks. Enregistrer only lights up once
// something differs from what is saved.
export function TransactionReviewModal({
  project,
  context,
  readOnly,
  suppliers,
  isBudgetSelected,
  canToggleBudgetSelection,
  onToggleBudgetSelection,
  onClose,
}: TransactionReviewModalProps) {
  const queryClient = useQueryClient()
  const updateTransactionMutation = useUpdateBudgetLineTransactionMutation()
  const selectBudgetCandidateMutation = useSelectBudgetCandidateMutation()
  const unselectBudgetCandidateMutation = useUnselectBudgetCandidateMutation()
  const { budgetLine, product, transaction } = context
  const [savedForm] = useState(() => createInitialUpdateFormState(transaction))
  const [mutationError, setMutationError] = useState<string | null>(null)
  const { form, setForm, updateField } = useTransactionAmountForm(
    () => savedForm,
    { onChange: () => setMutationError(null) },
  )
  const [localIsBudgetSelected, setLocalIsBudgetSelected] =
    useState(isBudgetSelected)
  const [isDeleteConfirmationOpen, setIsDeleteConfirmationOpen] =
    useState(false)
  const isMutating =
    updateTransactionMutation.isPending ||
    selectBudgetCandidateMutation.isPending ||
    unselectBudgetCandidateMutation.isPending
  const isQuote = transaction.transaction_type === 'quote'
  const isDirty = !isSameForm(form, savedForm)
  const canToggleBudgetSelectionFromForm =
    localIsBudgetSelected ||
    canToggleBudgetSelection ||
    (isQuote && form.quote_status !== 'rejected')
  const isBudgetSelectionDisabled =
    readOnly || !canToggleBudgetSelectionFromForm || isMutating

  function changeQuoteStatus(quoteStatus: QuoteStatus) {
    updateField('quote_status', quoteStatus)
  }

  function changeInvoiceStatus(invoiceStatus: InvoiceStatus) {
    setForm((current) => ({
      ...current,
      invoice_status: invoiceStatus,
      payment_date:
        invoiceStatus !== 'paid'
          ? ''
          : current.payment_date ||
            savedForm.payment_date ||
            defaultPaymentDate(current.issued_date),
    }))
    setMutationError(null)
  }

  async function handleSubmit(
    event: SyntheticEvent<HTMLFormElement, SubmitEvent>,
  ) {
    event.preventDefault()
    if (readOnly || !isDirty) return
    setMutationError(null)

    try {
      const projectId = requiredId(project.id, 'Projet')
      const budgetLineId = requiredId(
        budgetLine.budget_line_id,
        'Ligne de budget',
      )
      const transactionId = requiredId(transaction.id, 'Transaction')

      await updateTransactionMutation.mutateAsync({
        projectId,
        budgetLineId,
        transactionId,
        transaction: buildTransactionUpdate(transaction, form),
      })
      invalidateBudgetWorkspaceQueries(queryClient, projectId, budgetLineId)
      notifySuccess('Transaction modifiée.')
      onClose()
    } catch (error) {
      const message = getApiErrorMessage(error)
      setMutationError(message)
      notifyError(`Impossible de modifier la transaction. ${message}`)
    }
  }

  async function handleBudgetSelectionToggle() {
    if (readOnly || !canToggleBudgetSelectionFromForm) return
    setMutationError(null)

    try {
      const projectId = requiredId(project.id, 'Projet')
      const budgetLineId = requiredId(
        budgetLine.budget_line_id,
        'Ligne de budget',
      )
      const transactionId = requiredId(transaction.id, 'Transaction')

      if (localIsBudgetSelected) {
        await unselectBudgetCandidateMutation.mutateAsync({
          projectId,
          budgetLineId,
          transactionId,
        })
      } else {
        await selectBudgetCandidateMutation.mutateAsync({
          projectId,
          budgetLineId,
          transactionId,
        })
      }
      invalidateBudgetWorkspaceQueries(queryClient, projectId, budgetLineId)
      setLocalIsBudgetSelected((current) => !current)
      onToggleBudgetSelection()
      notifySuccess(
        localIsBudgetSelected
          ? 'Transaction retirée du budget sélectionné.'
          : 'Transaction sélectionnée pour le budget.',
      )
    } catch (error) {
      const message = getApiErrorMessage(error)
      setMutationError(message)
      notifyError(`Impossible de modifier la sélection budget. ${message}`)
    }
  }

  const addedAndModified = [
    transaction.created_at
      ? `Ajoutée le ${formatDate(transaction.created_at)}`
      : null,
    transaction.updated_at
      ? `modifiée le ${formatDate(transaction.updated_at)}`
      : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <>
      <ModalShell
        size="narrow"
        title={transactionTypeLabels[transaction.transaction_type]}
        subtitle={transactionBreadcrumb(product, budgetLine)}
        icon={<Edit3 className="h-5 w-5" aria-hidden="true" />}
        closeDisabled={isMutating}
        onClose={onClose}
        footerLeading={
          readOnly ? null : (
            <ModalDeleteButton
              disabled={isMutating}
              onClick={() => setIsDeleteConfirmationOpen(true)}
            >
              Supprimer
            </ModalDeleteButton>
          )
        }
        footer={
          readOnly ? (
            <ModalCloseButton onClick={onClose} />
          ) : (
            <>
              {isDirty ? (
                <ModalCancelButton onClick={onClose} disabled={isMutating} />
              ) : (
                <ModalCloseButton onClick={onClose} disabled={isMutating} />
              )}
              <ModalSaveButton
                form="transaction-review-form"
                disabled={!isDirty || isMutating}
                isSaving={updateTransactionMutation.isPending}
              />
            </>
          )
        }
      >
        <form
          id="transaction-review-form"
          className="space-y-5"
          onSubmit={handleSubmit}
        >
          <TransactionFormBody
            idPrefix="transaction-review"
            transactionType={transaction.transaction_type}
            form={form}
            suppliers={suppliers}
            disabled={readOnly}
            detailsOpenByDefault
            budgetSelection={
              <BudgetSelectionRow
                checked={localIsBudgetSelected}
                disabled={isBudgetSelectionDisabled}
                hint={
                  isQuote && form.quote_status === 'rejected'
                    ? 'Un devis rejeté ne peut pas être sélectionné.'
                    : undefined
                }
                onChange={() => void handleBudgetSelectionToggle()}
              />
            }
            documents={
              Number.isInteger(Number(transaction.id)) ? (
                <TransactionDocumentsPanel
                  transactionId={Number(transaction.id)}
                  projectId={Number(project.id)}
                  readOnly={readOnly}
                />
              ) : null
            }
            footnote={
              addedAndModified ? (
                <p className="text-xs text-muted-foreground">
                  {addedAndModified}
                </p>
              ) : null
            }
            onFieldChange={(key, value) => updateField(key, value)}
            onQuoteStatusChange={changeQuoteStatus}
            onInvoiceStatusChange={changeInvoiceStatus}
            onInvoiceTypeChange={(invoiceType) =>
              updateField('invoice_type', invoiceType)
            }
            onPaymentMethodChange={(method) =>
              updateField('payment_method', method)
            }
          />

          {mutationError ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {mutationError}
            </div>
          ) : null}
        </form>
      </ModalShell>
      {isDeleteConfirmationOpen ? (
        <DeleteTransactionDialog
          context={context}
          projectId={Number(project.id)}
          onCancel={() => setIsDeleteConfirmationOpen(false)}
          onConfirm={() => {
            setIsDeleteConfirmationOpen(false)
            onClose()
          }}
        />
      ) : null}
    </>
  )
}
