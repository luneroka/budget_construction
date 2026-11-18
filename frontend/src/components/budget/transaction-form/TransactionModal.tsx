import { type SyntheticEvent, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { FilePlus2 } from 'lucide-react'

import {
  invalidateDocumentQueries,
  invalidateProjectFinancialQueries,
} from '@/api/budget-workspace-cache'
import { getApiErrorMessage } from '@/api/client'
import { useUploadTransactionDocumentMutation } from '@/api/documents'
import { useCreateTransactionMutation } from '@/api/transactions'
import type { ProjectLotRead } from '@/api/types'
import {
  ModalCancelButton,
  ModalSaveButton,
  ModalShell,
} from '@/components/shared/ModalShell'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { notifyError, notifySuccess } from '@/lib/toasts'
import type {
  InvoiceStatus,
  Project,
  QuoteStatus,
  Supplier,
  TransactionType,
} from '@/types'

import { TransactionFormBody } from './TransactionFormBody'
import { NewTransactionDocumentField } from './TransactionFormFields'
import {
  type TransactionPrefill,
  buildTransactionCreate,
  createInitialFormState,
  createTransactionLabels,
  defaultPaymentDate,
  isSameFormState,
  newTransactionTitles,
  normalizeForType,
  requiredId,
  transactionBreadcrumb,
  transactionTypeLabels,
} from './transactionForm'
import { useTransactionAmountForm } from './useTransactionAmountForm'

type TransactionModalProps = {
  project: Project
  /** The project's visible lots, for the lot picker. */
  lots: ProjectLotRead[]
  /** The lot the modal was opened from; the picker can change it. */
  initialLotId?: number
  /** The button used to open the modal decides the type; it can be switched. */
  initialType?: TransactionType
  prefill?: TransactionPrefill
  suppliers: Supplier[]
  onClose: () => void
}

const addedMessages: Record<TransactionType, string> = {
  quote: 'Devis ajouté',
  invoice: 'Facture ajoutée',
}

const typeOptions = (
  Object.entries(transactionTypeLabels) as [TransactionType, string][]
).map(([value, label]) => ({ value, label }))

export function TransactionModal({
  project,
  lots,
  initialLotId,
  initialType = 'quote',
  prefill,
  suppliers,
  onClose,
}: TransactionModalProps) {
  const queryClient = useQueryClient()
  const createTransactionMutation = useCreateTransactionMutation()
  const uploadDocumentMutation = useUploadTransactionDocumentMutation()
  const [documentFile, setDocumentFile] = useState<File | null>(null)
  const [createdTransactionId, setCreatedTransactionId] = useState<
    number | null
  >(null)
  const [mutationError, setMutationError] = useState<string | null>(null)
  const [initialForm] = useState(() =>
    createInitialFormState({
      transactionType: initialType,
      lotId: initialLotId === undefined ? '' : String(initialLotId),
      prefill,
    }),
  )
  const { form, setForm, updateField } = useTransactionAmountForm(
    () => initialForm,
    {
      onChange: () => setMutationError(null),
      // An invoice prefilled from a quote starts from the quote's HT.
      initialSource: prefill?.amount_ht ? 'ht' : 'ttc',
    },
  )
  const hasUnsavedChanges =
    documentFile !== null || !isSameFormState(form, initialForm)
  const transactionType = form.transaction_type
  const isSubmitting =
    createTransactionMutation.isPending || uploadDocumentMutation.isPending
  const selectedLot = lots.find((lot) => String(lot.id) === form.lot_id)

  function changeType(nextType: TransactionType) {
    setForm((current) => normalizeForType(current, nextType))
    setMutationError(null)
  }

  function changeQuoteStatus(quoteStatus: QuoteStatus) {
    updateField('quote_status', quoteStatus)
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
      let transactionId = createdTransactionId

      if (transactionId === null) {
        const created = await createTransactionMutation.mutateAsync({
          projectId,
          transaction: buildTransactionCreate({ form }),
        })
        transactionId = created.id
        invalidateProjectFinancialQueries(queryClient, projectId)
      }

      if (documentFile) {
        isUploadingDocument = true
        // A failed upload keeps the transaction: a retry only uploads.
        setCreatedTransactionId(transactionId)
        await uploadDocumentMutation.mutateAsync({
          transactionId,
          file: documentFile,
        })
        invalidateDocumentQueries(queryClient, transactionId)
        invalidateProjectFinancialQueries(queryClient, projectId)
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
      subtitle={transactionBreadcrumb(selectedLot)}
      icon={<FilePlus2 className="h-5 w-5" aria-hidden="true" />}
      closeDisabled={isSubmitting}
      hasUnsavedChanges={hasUnsavedChanges}
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
          disabled={createdTransactionId !== null}
          onChange={changeType}
        />

        <TransactionFormBody
          idPrefix="transaction-create"
          transactionType={transactionType}
          form={form}
          lots={lots}
          suppliers={suppliers}
          disabled={createdTransactionId !== null}
          // A quote or an invoice arrives as a document: attaching it comes
          // first.
          documentsFirst
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
