import { type SyntheticEvent, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Edit3, Eye } from 'lucide-react'

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
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { formatCurrency, formatDate } from '@/lib/format'
import { notifyError, notifySuccess } from '@/lib/toasts'
import { cn } from '@/lib/utils'
import type {
  InvoiceStatus,
  InvoiceType,
  PaymentMethod,
  Project,
  QuoteStatus,
  Supplier,
} from '@/types'

import { SupplierSelectField } from './SupplierSelectField'
import { TransactionDocumentsPanel } from './TransactionDocumentsPanel'
import {
  CompactSection,
  Field,
  TransactionContextSummary,
} from './TransactionFormFields'
import {
  type ViewedTransactionContext,
  buildTransactionUpdate,
  createInitialUpdateFormState,
  invoiceStatusLabels,
  invoiceTypeLabels,
  issuedDateLabels,
  paymentMethodLabels,
  quoteStatusLabels,
  requiredId,
} from './transactionForm'
import { useTransactionAmountForm } from './useTransactionAmountForm'

type TransactionReviewModalProps = {
  project: Project
  context: ViewedTransactionContext
  initialMode?: 'view' | 'edit'
  readOnly?: boolean
  suppliers: Supplier[]
  isBudgetSelected: boolean
  canToggleBudgetSelection: boolean
  onToggleBudgetSelection: () => void
  onClose: () => void
}

export function TransactionReviewModal({
  project,
  context,
  initialMode = 'view',
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
  const [isEditing, setIsEditing] = useState(
    !readOnly && initialMode === 'edit',
  )
  const [mutationError, setMutationError] = useState<string | null>(null)
  const { form, setForm, updateField, resetForm } = useTransactionAmountForm(
    () => createInitialUpdateFormState(transaction),
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
  const selectedSupplierName =
    suppliers.find((supplier) => supplier.id === form.supplier_id)?.name ??
    'Aucun fournisseur'
  const isQuote = transaction.transaction_type === 'quote'
  const isInvoice = transaction.transaction_type === 'invoice'
  const canToggleBudgetSelectionFromForm =
    localIsBudgetSelected ||
    canToggleBudgetSelection ||
    (isEditing && isQuote && form.quote_status !== 'rejected')
  const isBudgetSelectionDisabled =
    readOnly || !canToggleBudgetSelectionFromForm || isMutating

  function updateInvoiceStatus(invoiceStatus: InvoiceStatus) {
    setForm((current) => ({
      ...current,
      invoice_status: invoiceStatus,
      payment_date: invoiceStatus === 'paid' ? current.payment_date : '',
    }))
    setMutationError(null)
  }

  function resetEditMode() {
    resetForm(createInitialUpdateFormState(transaction))
    setMutationError(null)
    setIsEditing(false)
  }

  async function handleSubmit(
    event: SyntheticEvent<HTMLFormElement, SubmitEvent>,
  ) {
    event.preventDefault()
    if (readOnly || !isEditing) return
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

  return (
    <>
      <ModalShell
        title={
          isEditing ? 'Modifier la transaction' : 'Détails de la transaction'
        }
        icon={
          isEditing ? (
            <Edit3 className="h-5 w-5" aria-hidden="true" />
          ) : (
            <Eye className="h-5 w-5" aria-hidden="true" />
          )
        }
        headerActions={
          isEditing || readOnly ? null : (
            <Button
              size="sm"
              variant="outline"
              type="button"
              onClick={() => setIsEditing(true)}
            >
              <Edit3 aria-hidden />
              Modifier
            </Button>
          )
        }
        onClose={onClose}
        footerLeading={
          !isEditing && !readOnly ? (
            <ModalDeleteButton
              disabled={isMutating}
              onClick={() => setIsDeleteConfirmationOpen(true)}
            >
              Supprimer la transaction
            </ModalDeleteButton>
          ) : null
        }
        footer={
          isEditing ? (
            <>
              <ModalCancelButton
                onClick={resetEditMode}
                disabled={isMutating}
              />
              <ModalSaveButton
                form="transaction-review-form"
                disabled={isMutating}
                isSaving={isMutating}
              />
            </>
          ) : (
            <ModalCloseButton onClick={onClose} />
          )
        }
      >
        <form
          id="transaction-review-form"
          className="space-y-4 text-sm"
          onSubmit={handleSubmit}
        >
          <TransactionContextSummary
            project={project}
            product={product}
            budgetLine={budgetLine}
          />

          {transaction.created_at || transaction.updated_at ? (
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {transaction.created_at ? (
                <span>Ajoutée le {formatDate(transaction.created_at)}</span>
              ) : null}
              {transaction.updated_at ? (
                <span className="sm:ml-auto">
                  Dernière modification : {formatDate(transaction.updated_at)}
                </span>
              ) : null}
            </div>
          ) : null}

          <CompactSection title="Transaction">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field
                label={issuedDateLabels[transaction.transaction_type]}
                htmlFor="review-transaction-issued-date"
              >
                <Input
                  id="review-transaction-issued-date"
                  className="h-9 text-sm"
                  type={isEditing ? 'date' : 'text'}
                  value={
                    isEditing
                      ? form.issued_date
                      : formatDate(transaction.issued_date)
                  }
                  readOnly={!isEditing}
                  disabled={!isEditing}
                  onChange={(event) =>
                    updateField('issued_date', event.target.value)
                  }
                  required
                />
              </Field>
              <Field label="Fournisseur" htmlFor="review-transaction-supplier">
                {isEditing ? (
                  <SupplierSelectField
                    id="review-transaction-supplier"
                    className="h-9 text-sm"
                    value={form.supplier_id}
                    suppliers={suppliers}
                    onChange={(supplierId) =>
                      updateField('supplier_id', supplierId)
                    }
                  />
                ) : (
                  <Input
                    id="review-transaction-supplier"
                    className="h-9 text-sm"
                    value={transaction.supplier_name ?? selectedSupplierName}
                    readOnly
                    disabled
                  />
                )}
              </Field>
              <div>
                <p className="text-xs font-medium">Type</p>
                <div
                  className={cn(
                    'mt-1 flex h-9 items-center rounded-md border border-input bg-muted/30 px-3',
                    !isEditing && 'cursor-not-allowed',
                  )}
                >
                  <StatusBadge
                    status={transaction.transaction_type}
                    disabled={isEditing}
                  />
                </div>
              </div>
              <Field label="Statut" htmlFor="review-transaction-status">
                {isEditing && isQuote ? (
                  <Select
                    id="review-transaction-status"
                    className="h-9 text-sm"
                    value={form.quote_status}
                    onChange={(event) =>
                      updateField(
                        'quote_status',
                        event.target.value as QuoteStatus,
                      )
                    }
                  >
                    {Object.entries(quoteStatusLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                ) : isEditing && isInvoice ? (
                  <Select
                    id="review-transaction-status"
                    className="h-9 text-sm"
                    value={form.invoice_status}
                    onChange={(event) =>
                      updateInvoiceStatus(event.target.value as InvoiceStatus)
                    }
                  >
                    {Object.entries(invoiceStatusLabels).map(
                      ([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ),
                    )}
                  </Select>
                ) : (
                  <div
                    className={cn(
                      'flex h-9 items-center rounded-md border border-input bg-muted/30 px-3',
                      !isEditing && 'cursor-not-allowed',
                    )}
                  >
                    {isQuote && transaction.quote_status ? (
                      <StatusBadge status={transaction.quote_status} />
                    ) : isInvoice && transaction.invoice_status ? (
                      <StatusBadge status={transaction.invoice_status} />
                    ) : null}
                  </div>
                )}
              </Field>

              <Field label="Montant HT" htmlFor="review-transaction-amount-ht">
                <Input
                  id="review-transaction-amount-ht"
                  className="h-9 text-sm"
                  type={isEditing ? 'number' : 'text'}
                  min="0"
                  step="0.01"
                  value={
                    isEditing
                      ? form.amount_ht
                      : formatCurrency(transaction.amount_ht)
                  }
                  readOnly={!isEditing}
                  disabled={!isEditing}
                  onChange={(event) =>
                    updateField('amount_ht', event.target.value)
                  }
                  required
                />
              </Field>
              <Field label="TVA" htmlFor="review-transaction-vat-rate">
                <Input
                  id="review-transaction-vat-rate"
                  className="h-9 text-sm"
                  type={isEditing ? 'number' : 'text'}
                  min="0"
                  step="0.01"
                  value={
                    isEditing ? form.vat_rate : `${transaction.vat_rate} %`
                  }
                  readOnly={!isEditing}
                  disabled={!isEditing}
                  onChange={(event) =>
                    updateField('vat_rate', event.target.value)
                  }
                />
              </Field>
              <Field
                label="Montant TVA"
                htmlFor="review-transaction-amount-vat"
              >
                <Input
                  id="review-transaction-amount-vat"
                  className="h-9 text-sm"
                  value={
                    isEditing
                      ? form.amount_vat
                      : formatCurrency(transaction.amount_vat)
                  }
                  readOnly
                  disabled
                />
              </Field>
              <Field
                label="Montant TTC"
                htmlFor="review-transaction-amount-ttc"
              >
                <Input
                  id="review-transaction-amount-ttc"
                  className="h-9 text-sm"
                  type={isEditing ? 'number' : 'text'}
                  min="0"
                  step="0.01"
                  value={
                    isEditing
                      ? form.amount_ttc
                      : formatCurrency(transaction.amount_ttc)
                  }
                  readOnly={!isEditing}
                  disabled={!isEditing}
                  onChange={(event) =>
                    updateField('amount_ttc', event.target.value)
                  }
                  required
                />
              </Field>
            </div>

            {isQuote || isInvoice ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Field
                  label="Date d'échéance"
                  htmlFor="review-transaction-due-date"
                >
                  <Input
                    id="review-transaction-due-date"
                    className="h-9 text-sm"
                    type={isEditing ? 'date' : 'text'}
                    value={
                      isEditing
                        ? form.due_date
                        : formatDate(transaction.due_date)
                    }
                    readOnly={!isEditing}
                    disabled={!isEditing}
                    onChange={(event) =>
                      updateField('due_date', event.target.value)
                    }
                  />
                </Field>
                {isInvoice ? (
                  <>
                    <Field
                      label="Date de paiement"
                      htmlFor="review-transaction-payment-date"
                    >
                      <Input
                        id="review-transaction-payment-date"
                        className="h-9 text-sm"
                        type={isEditing ? 'date' : 'text'}
                        value={
                          isEditing
                            ? form.payment_date
                            : formatDate(transaction.payment_date)
                        }
                        readOnly={!isEditing}
                        disabled={isEditing && form.invoice_status !== 'paid'}
                        onChange={(event) =>
                          updateField('payment_date', event.target.value)
                        }
                        required={isEditing && form.invoice_status === 'paid'}
                      />
                    </Field>
                    <Field
                      label="Type facture"
                      htmlFor="review-transaction-invoice-type"
                    >
                      {isEditing ? (
                        <Select
                          id="review-transaction-invoice-type"
                          className="h-9 text-sm"
                          value={form.invoice_type}
                          onChange={(event) =>
                            updateField(
                              'invoice_type',
                              event.target.value as InvoiceType,
                            )
                          }
                        >
                          {Object.entries(invoiceTypeLabels).map(
                            ([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ),
                          )}
                        </Select>
                      ) : (
                        <Input
                          id="review-transaction-invoice-type"
                          className="h-9 text-sm"
                          value={
                            transaction.invoice_type
                              ? invoiceTypeLabels[transaction.invoice_type]
                              : ''
                          }
                          readOnly
                        />
                      )}
                    </Field>
                    <Field
                      label="Moyen de paiement"
                      htmlFor="review-transaction-payment-method"
                    >
                      {isEditing ? (
                        <Select
                          id="review-transaction-payment-method"
                          className="h-9 text-sm"
                          value={form.payment_method}
                          onChange={(event) =>
                            updateField(
                              'payment_method',
                              event.target.value as PaymentMethod,
                            )
                          }
                        >
                          {Object.entries(paymentMethodLabels).map(
                            ([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ),
                          )}
                        </Select>
                      ) : (
                        <Input
                          id="review-transaction-payment-method"
                          className="h-9 text-sm"
                          value={
                            transaction.payment_method
                              ? paymentMethodLabels[transaction.payment_method]
                              : ''
                          }
                          readOnly
                        />
                      )}
                    </Field>
                  </>
                ) : null}
              </div>
            ) : null}
          </CompactSection>

          <CompactSection title="Détails">
            <div
              className={cn(
                'grid gap-3 lg:items-end',
                isInvoice
                  ? 'lg:grid-cols-1'
                  : 'lg:grid-cols-[minmax(16rem,1fr)_13rem]',
              )}
            >
              <Field
                label="Description"
                htmlFor="review-transaction-description"
              >
                <Input
                  id="review-transaction-description"
                  className="h-9 text-sm"
                  value={form.description}
                  readOnly={!isEditing}
                  disabled={!isEditing}
                  onChange={(event) =>
                    updateField('description', event.target.value)
                  }
                />
              </Field>
              {isInvoice ? null : (
                <label
                  className={cn(
                    'flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm',
                    isBudgetSelectionDisabled
                      ? 'cursor-not-allowed'
                      : 'cursor-pointer',
                  )}
                >
                  <Checkbox
                    checked={localIsBudgetSelected}
                    disabled={isBudgetSelectionDisabled}
                    onChange={handleBudgetSelectionToggle}
                  />
                  Sélectionner pour budget
                </label>
              )}
            </div>
          </CompactSection>

          {Number.isInteger(Number(transaction.id)) ? (
            <TransactionDocumentsPanel
              transactionId={Number(transaction.id)}
              projectId={Number(project.id)}
              readOnly={readOnly}
            />
          ) : null}

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
