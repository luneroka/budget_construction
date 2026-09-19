import { type SyntheticEvent, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { FilePlus2 } from 'lucide-react'

import {
  invalidateBudgetWorkspaceQueries,
  invalidateDocumentQueries,
} from '@/api/budget-workspace-cache'
import { getApiErrorMessage } from '@/api/client'
import { useUploadTransactionDocumentMutation } from '@/api/documents'
import {
  useCreateBudgetLineTransactionMutation,
  useCreateProductTransactionMutation,
} from '@/api/transactions'
import type { TransactionRead } from '@/api/types'
import {
  ModalCancelButton,
  ModalSaveButton,
  ModalShell,
} from '@/components/shared/ModalShell'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { notifyError, notifySuccess } from '@/lib/toasts'
import type {
  BudgetLine,
  InvoiceStatus,
  Product,
  Project,
  QuoteStatus,
  Supplier,
  TransactionType,
} from '@/types'

import { TransactionFormBody } from './TransactionFormBody'
import {
  BudgetSelectionRow,
  NewTransactionDocumentField,
} from './TransactionFormFields'
import {
  type TransactionPrefill,
  buildProductTransactionCreate,
  buildTransactionCreate,
  canSelectCreatedTransactionAsBudget,
  createInitialFormState,
  createTransactionLabels,
  defaultPaymentDate,
  newTransactionTitles,
  normalizeForType,
  requiredId,
  transactionBreadcrumb,
  transactionTypeLabels,
} from './transactionForm'
import { useTransactionAmountForm } from './useTransactionAmountForm'

type CreatedTransactionForDocument = {
  transactionId: number
  budgetLineId: number
}

type TransactionModalProps = {
  project: Project
  product: Product
  budgetLine?: BudgetLine
  /** The button used to open the modal decides the type; it can be switched. */
  initialType?: TransactionType
  prefill?: TransactionPrefill
  suppliers: Supplier[]
  onClose: () => void
}

const addedMessages: Record<TransactionType, string> = {
  quote: 'Devis ajouté',
  diy_estimate: 'Estimation ajoutée',
  invoice: 'Facture ajoutée',
}

const typeOptions = (
  Object.entries(transactionTypeLabels) as [TransactionType, string][]
).map(([value, label]) => ({ value, label }))

export function TransactionModal({
  project,
  product,
  budgetLine,
  initialType = 'quote',
  prefill,
  suppliers,
  onClose,
}: TransactionModalProps) {
  const queryClient = useQueryClient()
  const createBudgetLineTransactionMutation =
    useCreateBudgetLineTransactionMutation()
  const createProductTransactionMutation = useCreateProductTransactionMutation()
  const uploadDocumentMutation = useUploadTransactionDocumentMutation()
  const [documentFile, setDocumentFile] = useState<File | null>(null)
  const [createdTransactionForDocument, setCreatedTransactionForDocument] =
    useState<CreatedTransactionForDocument | null>(null)
  const [mutationError, setMutationError] = useState<string | null>(null)
  // The first quote or estimate on a line is retained as its budget unless
  // the user says otherwise: a line with a budget candidate but no retained
  // budget is rarely what anyone wants.
  const lineHasRetainedBudget =
    budgetLine?.transactions.some(
      (transaction) =>
        transaction.transaction_type !== 'invoice' &&
        transaction.select_as_budget,
    ) ?? false
  const retainByDefault = !lineHasRetainedBudget
  const lineScope =
    budgetLine?.item_type === 'breakdown' ? 'ce sous-produit' : 'ce produit'
  const { form, setForm, updateField } = useTransactionAmountForm(
    () =>
      createInitialFormState({
        transactionType: initialType,
        selectAsBudget: retainByDefault,
        prefill,
      }),
    { onChange: () => setMutationError(null) },
  )
  const transactionType = form.transaction_type
  const isSubmitting =
    createBudgetLineTransactionMutation.isPending ||
    createProductTransactionMutation.isPending ||
    uploadDocumentMutation.isPending

  function changeType(nextType: TransactionType) {
    setForm((current) => ({
      ...normalizeForType(current, nextType),
      select_as_budget: nextType !== 'invoice' && retainByDefault,
    }))
    setMutationError(null)
  }

  function changeQuoteStatus(quoteStatus: QuoteStatus) {
    setForm((current) => ({
      ...current,
      quote_status: quoteStatus,
      select_as_budget:
        quoteStatus === 'rejected'
          ? false
          : current.quote_status === 'rejected'
            ? retainByDefault
            : current.select_as_budget,
    }))
    setMutationError(null)
  }

  function changeInvoiceStatus(invoiceStatus: InvoiceStatus) {
    setForm((current) => ({
      ...current,
      invoice_status: invoiceStatus,
      payment_date:
        invoiceStatus === 'paid' && current.payment_date === ''
          ? defaultPaymentDate(current.issued_date)
          : current.payment_date,
    }))
    setMutationError(null)
  }

  async function handleSubmit(
    event: SyntheticEvent<HTMLFormElement, SubmitEvent>,
  ) {
    event.preventDefault()
    setMutationError(null)
    let isUploadingDocument = false

    try {
      const projectId = requiredId(project.id, 'Projet')
      let createdTransaction: TransactionRead
      let targetBudgetLineId: number

      if (createdTransactionForDocument) {
        createdTransaction = {
          id: createdTransactionForDocument.transactionId,
          budget_line_id: createdTransactionForDocument.budgetLineId,
        } as TransactionRead
        targetBudgetLineId = createdTransactionForDocument.budgetLineId
      } else if (budgetLine) {
        const budgetLineId = requiredId(
          budgetLine.budget_line_id,
          'Ligne de budget',
        )
        createdTransaction =
          await createBudgetLineTransactionMutation.mutateAsync({
            projectId,
            budgetLineId,
            transaction: buildTransactionCreate({ form }),
          })
        targetBudgetLineId = budgetLineId
        invalidateBudgetWorkspaceQueries(queryClient, projectId, budgetLineId)
      } else {
        const productId = requiredId(product.product_id, 'Produit')
        createdTransaction = await createProductTransactionMutation.mutateAsync(
          {
            projectId,
            productId,
            transaction: buildProductTransactionCreate(form),
          },
        )
        targetBudgetLineId = createdTransaction.budget_line_id
        invalidateBudgetWorkspaceQueries(
          queryClient,
          projectId,
          createdTransaction.budget_line_id,
        )
      }

      if (documentFile) {
        isUploadingDocument = true
        setCreatedTransactionForDocument({
          transactionId: createdTransaction.id,
          budgetLineId: targetBudgetLineId,
        })
        await uploadDocumentMutation.mutateAsync({
          transactionId: createdTransaction.id,
          file: documentFile,
        })
        invalidateDocumentQueries(queryClient, createdTransaction.id)
        invalidateBudgetWorkspaceQueries(
          queryClient,
          projectId,
          targetBudgetLineId,
        )
      }

      notifySuccess(
        documentFile
          ? `${addedMessages[transactionType]} avec son document.`
          : `${addedMessages[transactionType]}.`,
      )
      onClose()
    } catch (error) {
      const message = getApiErrorMessage(error)
      setMutationError(message)
      notifyError(
        isUploadingDocument
          ? `Impossible d’ajouter le document. ${message}`
          : `Impossible d’ajouter la transaction. ${message}`,
      )
    }
  }

  return (
    <ModalShell
      size="narrow"
      title={newTransactionTitles[transactionType]}
      subtitle={transactionBreadcrumb(product, budgetLine)}
      icon={<FilePlus2 className="h-5 w-5" aria-hidden="true" />}
      closeDisabled={isSubmitting}
      onClose={onClose}
      footer={
        <>
          <ModalCancelButton onClick={onClose} disabled={isSubmitting} />
          <ModalSaveButton
            form="transaction-create-form"
            disabled={isSubmitting}
            isSaving={isSubmitting}
            savingLabel="Création..."
          >
            {createTransactionLabels[transactionType]}
          </ModalSaveButton>
        </>
      }
    >
      <form
        id="transaction-create-form"
        className="space-y-5"
        onSubmit={handleSubmit}
      >
        <SegmentedControl
          aria-label="Type de transaction"
          value={transactionType}
          options={typeOptions}
          disabled={createdTransactionForDocument !== null}
          onChange={changeType}
        />

        <TransactionFormBody
          idPrefix="transaction-create"
          transactionType={transactionType}
          form={form}
          suppliers={suppliers}
          autoFocusAmount
          budgetSelection={
            <BudgetSelectionRow
              checked={
                canSelectCreatedTransactionAsBudget(form) &&
                form.select_as_budget
              }
              disabled={!canSelectCreatedTransactionAsBudget(form)}
              hint={
                !canSelectCreatedTransactionAsBudget(form)
                  ? 'Un devis rejeté ne peut pas être sélectionné.'
                  : lineHasRetainedBudget
                    ? `Son montant s’ajoutera aux transactions déjà sélectionnées pour ${lineScope}.`
                    : `Aucune transaction n’est encore sélectionnée pour ${lineScope}.`
              }
              onChange={(checked) => updateField('select_as_budget', checked)}
            />
          }
          documents={
            <NewTransactionDocumentField
              file={documentFile}
              disabled={isSubmitting}
              onFileChange={(file) => {
                setDocumentFile(file)
                setMutationError(null)
              }}
              onClear={() => setDocumentFile(null)}
            />
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
  )
}
