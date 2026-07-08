import { type ReactNode, type SyntheticEvent, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  Download,
  Edit3,
  Eye,
  FilePlus2,
  Paperclip,
  Trash2,
  X,
} from 'lucide-react'

import {
  invalidateBudgetWorkspaceQueries,
  invalidateDocumentQueries,
} from '@/api/budget-workspace-cache'
import { getApiErrorMessage } from '@/api/client'
import {
  useDeleteDocumentMutation,
  useTransactionDocumentsQuery,
  useUploadTransactionDocumentMutation,
} from '@/api/documents'
import {
  useCreateBudgetLineTransactionMutation,
  useCreateProductTransactionMutation,
  useSelectBudgetCandidateMutation,
  useUnselectBudgetCandidateMutation,
  useUpdateBudgetLineTransactionMutation,
} from '@/api/transactions'
import type {
  DocumentRead,
  TransactionCreate,
  TransactionCreateForProduct,
  TransactionRead,
  TransactionUpdate,
} from '@/api/types'
import { ConfirmationDialog } from '@/components/shared/ConfirmationDialog'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import type {
  BudgetLineSummaryViewModel,
  InvoiceStatus,
  InvoiceType,
  PaymentMethod,
  ProductSummaryViewModel,
  ProjectViewModel,
  QuoteStatus,
  SupplierRowViewModel,
  TransactionType,
  TransactionViewModel,
} from '@/demo/types'
import { downloadDocument } from '@/lib/documents'
import { formatCurrency, formatDate } from '@/lib/format'
import { notifyError, notifySuccess } from '@/lib/toasts'
import { cn } from '@/lib/utils'

type ProductStructureChoice = 'single' | 'breakdown'
type BudgetConcern = 'entire_product' | 'specific_element'
type AmountSource = 'ht' | 'ttc'

type AmountFields = {
  amount_ht: string
  vat_rate: string
  amount_vat: string
  amount_ttc: string
}

type TransactionFormState = {
  transaction_type: TransactionType
  supplier_id: string
  amount_ht: string
  vat_rate: string
  amount_vat: string
  amount_ttc: string
  issued_date: string
  due_date: string
  payment_date: string
  description: string
  quote_status: QuoteStatus
  invoice_status: InvoiceStatus
  invoice_type: InvoiceType
  payment_method: PaymentMethod
  select_as_budget: boolean
  budget_concern: BudgetConcern
  budget_line_name: string
}

type TransactionUpdateFormState = {
  supplier_id: string
  amount_ht: string
  vat_rate: string
  amount_vat: string
  amount_ttc: string
  issued_date: string
  due_date: string
  payment_date: string
  description: string
  quote_status: QuoteStatus
  invoice_status: InvoiceStatus
  invoice_type: InvoiceType
  payment_method: PaymentMethod
}

type CreatedTransactionForDocument = {
  transactionId: number
  budgetLineId: number
}

export type ViewedTransactionContext = {
  transaction: TransactionViewModel
  product: ProductSummaryViewModel
  budgetLine: BudgetLineSummaryViewModel
}

type TransactionModalProps = {
  project: ProjectViewModel
  product: ProductSummaryViewModel
  budgetLine?: BudgetLineSummaryViewModel
  initialStructure?: ProductStructureChoice
  suppliers: SupplierRowViewModel[]
  onClose: () => void
}

type TransactionReviewModalProps = {
  project: ProjectViewModel
  context: ViewedTransactionContext
  initialMode?: 'view' | 'edit'
  readOnly?: boolean
  suppliers: SupplierRowViewModel[]
  isBudgetSelected: boolean
  canToggleBudgetSelection: boolean
  onToggleBudgetSelection: () => void
  onClose: () => void
}

const transactionTypeLabels: Record<TransactionType, string> = {
  quote: 'Devis',
  diy_estimate: 'Estimation DIY',
  invoice: 'Facture',
}

const quoteStatusLabels: Record<QuoteStatus, string> = {
  to_confirm: 'À confirmer',
  to_negotiate: 'À négocier',
  validated: 'Validé',
}

const invoiceStatusLabels: Record<InvoiceStatus, string> = {
  unpaid: 'Impayée',
  on_hold: 'En attente',
  paid: 'Payée',
}

const invoiceTypeLabels: Record<InvoiceType, string> = {
  full: 'Complète',
  deposit: 'Acompte',
  interim: 'Intermédiaire',
  balance: 'Solde',
}

const paymentMethodLabels: Record<PaymentMethod, string> = {
  cash: 'Espèces',
  card: 'Carte',
  wire: 'Virement',
}

const documentInputAccept =
  'application/pdf,image/jpeg,image/png,image/heic,.pdf,.jpg,.jpeg,.png,.heic'

function todayAsInputValue() {
  return new Date().toISOString().slice(0, 10)
}

function emptyToNull(value: string) {
  return value.trim() === '' ? null : value
}

function optionalDecimal(value: string) {
  return emptyToNull(value)
}

function optionalId(value: string) {
  const parsed = Number(value)
  return Number.isInteger(parsed) ? parsed : null
}

function requiredId(value: string, label: string) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed)) {
    throw new Error(`${label} invalide`)
  }

  return parsed
}

function formatNumberInput(value: number | null | undefined) {
  return value == null ? '' : String(value)
}

function parseAmountInput(value: string) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function formatCalculatedAmount(value: number) {
  return (Math.round(value * 100) / 100).toFixed(2)
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
}

function getSelectedFile(event: SyntheticEvent<HTMLInputElement>) {
  return event.currentTarget.files?.[0] ?? null
}

function recalculateAmounts<T extends AmountFields>(
  values: T,
  source: AmountSource,
): T {
  const vatRate = parseAmountInput(values.vat_rate)
  if (vatRate === null || vatRate < 0) {
    return { ...values, amount_vat: '' }
  }

  if (source === 'ttc') {
    const amountTtc = parseAmountInput(values.amount_ttc)
    if (amountTtc === null) {
      return { ...values, amount_ht: '', amount_vat: '' }
    }

    const divisor = 1 + vatRate / 100
    const amountHt = divisor === 0 ? amountTtc : amountTtc / divisor
    const amountVat = amountTtc - amountHt

    return {
      ...values,
      amount_ht: formatCalculatedAmount(amountHt),
      amount_vat: formatCalculatedAmount(amountVat),
      amount_ttc: values.amount_ttc,
    }
  }

  const amountHt = parseAmountInput(values.amount_ht)
  if (amountHt === null) {
    return { ...values, amount_vat: '', amount_ttc: '' }
  }

  const amountVat = amountHt * (vatRate / 100)
  const amountTtc = amountHt + amountVat

  return {
    ...values,
    amount_ht: values.amount_ht,
    amount_vat: formatCalculatedAmount(amountVat),
    amount_ttc: formatCalculatedAmount(amountTtc),
  }
}

function createInitialFormState(
  initialStructure?: ProductStructureChoice,
): TransactionFormState {
  return {
    transaction_type: 'quote',
    supplier_id: '',
    amount_ht: '',
    vat_rate: '20',
    amount_vat: '',
    amount_ttc: '',
    issued_date: todayAsInputValue(),
    due_date: '',
    payment_date: '',
    description: '',
    quote_status: 'to_confirm',
    invoice_status: 'unpaid',
    invoice_type: 'full',
    payment_method: 'wire',
    select_as_budget: false,
    budget_concern:
      initialStructure === 'breakdown' ? 'specific_element' : 'entire_product',
    budget_line_name: '',
  }
}

function createInitialUpdateFormState(
  transaction: TransactionViewModel,
): TransactionUpdateFormState {
  return {
    supplier_id: transaction.supplier_id ?? '',
    amount_ht: formatNumberInput(transaction.amount_ht),
    vat_rate: formatNumberInput(transaction.vat_rate),
    amount_vat: formatNumberInput(transaction.amount_vat),
    amount_ttc: formatNumberInput(transaction.amount_ttc),
    issued_date: transaction.issued_date,
    due_date: transaction.due_date ?? '',
    payment_date: transaction.payment_date ?? '',
    description: transaction.description,
    quote_status: transaction.quote_status ?? 'to_confirm',
    invoice_status: transaction.invoice_status ?? 'unpaid',
    invoice_type: transaction.invoice_type ?? 'full',
    payment_method: transaction.payment_method ?? 'wire',
  }
}

function normalizeForType(
  state: TransactionFormState,
  transactionType: TransactionType,
): TransactionFormState {
  if (transactionType === 'invoice') {
    return {
      ...state,
      transaction_type: transactionType,
      quote_status: 'to_confirm',
      select_as_budget: false,
      budget_concern: 'entire_product',
      budget_line_name: '',
    }
  }

  if (transactionType === 'diy_estimate') {
    return {
      ...state,
      transaction_type: transactionType,
      due_date: '',
      payment_date: '',
      quote_status: 'to_confirm',
      invoice_status: 'unpaid',
      invoice_type: 'full',
      payment_method: 'wire',
      select_as_budget: false,
    }
  }

  return {
    ...state,
    transaction_type: transactionType,
    payment_date: '',
    invoice_status: 'unpaid',
    invoice_type: 'full',
    payment_method: 'wire',
    select_as_budget: state.quote_status === 'validated',
  }
}

function canSelectCreatedTransactionAsBudget(form: TransactionFormState) {
  if (form.transaction_type === 'diy_estimate') return true
  return form.transaction_type === 'quote' && form.quote_status === 'validated'
}

function buildTransactionUpdate(
  transaction: TransactionViewModel,
  form: TransactionUpdateFormState,
): TransactionUpdate {
  const payload: TransactionUpdate = {
    supplier_id: optionalId(form.supplier_id),
    amount_ht: form.amount_ht,
    vat_rate: optionalDecimal(form.vat_rate),
    amount_ttc: optionalDecimal(form.amount_ttc),
    issued_date: form.issued_date,
    description: emptyToNull(form.description),
  }

  if (transaction.transaction_type === 'quote') {
    payload.quote_status = form.quote_status
    payload.due_date = emptyToNull(form.due_date)
  }

  if (transaction.transaction_type === 'invoice') {
    payload.invoice_status = form.invoice_status
    payload.invoice_type = form.invoice_type
    payload.payment_method = form.payment_method
    payload.due_date = emptyToNull(form.due_date)
    payload.payment_date =
      form.invoice_status === 'paid' ? emptyToNull(form.payment_date) : null
  }

  return payload
}

function buildTransactionCreate({
  form,
}: {
  form: TransactionFormState
}): TransactionCreate {
  const payload: TransactionCreate = {
    supplier_id: optionalId(form.supplier_id),
    transaction_type: form.transaction_type,
    amount_ht: form.amount_ht,
    vat_rate: optionalDecimal(form.vat_rate),
    amount_vat: optionalDecimal(form.amount_vat),
    amount_ttc: optionalDecimal(form.amount_ttc),
    issued_date: form.issued_date,
    description: emptyToNull(form.description),
    select_as_budget: canSelectCreatedTransactionAsBudget(form)
      ? form.select_as_budget
      : false,
  }

  if (form.transaction_type === 'quote') {
    payload.quote_status = form.quote_status
    payload.due_date = emptyToNull(form.due_date)
  }

  if (form.transaction_type === 'invoice') {
    payload.invoice_status = form.invoice_status
    payload.invoice_type = form.invoice_type
    payload.payment_method = form.payment_method
    payload.due_date = emptyToNull(form.due_date)
    payload.payment_date = emptyToNull(form.payment_date)
  }

  return payload
}

function buildProductTransactionCreate(
  form: TransactionFormState,
): TransactionCreateForProduct {
  const payload: TransactionCreateForProduct = buildTransactionCreate({ form })

  if (form.transaction_type !== 'invoice') {
    payload.budget_concern = form.budget_concern
    if (form.budget_concern === 'specific_element') {
      payload.budget_line_name = emptyToNull(form.budget_line_name)
    }
  }

  return payload
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor: string
  children: ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  )
}

function CompactSection({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <section className="space-y-3 rounded-md border border-border p-4">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase">
        {title}
      </h3>
      {children}
    </section>
  )
}

function TransactionContextSummary({
  project,
  product,
  budgetLine,
}: {
  project: ProjectViewModel
  product: ProductSummaryViewModel
  budgetLine?: BudgetLineSummaryViewModel
}) {
  const breadcrumbParts = [
    product.category_name,
    product.subcategory_name,
    product.product_name,
    budgetLine?.item_type === 'breakdown' ? budgetLine.name : null,
  ].filter(Boolean)

  return (
    <div className="grid gap-3 rounded-md border border-border bg-muted/25 px-4 py-3 text-sm md:grid-cols-2">
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">Projet</p>
        <p className="truncate font-medium text-foreground">{project.name}</p>
      </div>
      <div className="min-w-0 md:text-right">
        <p className="text-xs text-muted-foreground">Budget</p>
        <p className="truncate font-medium text-foreground">
          {breadcrumbParts.join(' > ')}
        </p>
      </div>
    </div>
  )
}

function SelectedDocumentPreview({
  file,
  onClear,
}: {
  file: File
  onClear: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2 text-sm">
      <span className="min-w-0">
        <span className="block truncate font-medium text-foreground">
          {file.name}
        </span>
        <span className="text-xs text-muted-foreground">
          {formatFileSize(file.size)}
        </span>
      </span>
      <Button size="sm" variant="ghost" type="button" onClick={onClear}>
        Retirer
      </Button>
    </div>
  )
}

function NewTransactionDocumentField({
  file,
  disabled,
  onFileChange,
  onClear,
}: {
  file: File | null
  disabled?: boolean
  onFileChange: (file: File | null) => void
  onClear: () => void
}) {
  return (
    <div className="space-y-2 rounded-md border border-border bg-background p-3">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <Paperclip className="h-4 w-4 text-muted-foreground" aria-hidden />
        Document
      </div>
      <Input
        key={file ? 'document-selected' : 'document-empty'}
        type="file"
        accept={documentInputAccept}
        disabled={disabled}
        onChange={(event) => onFileChange(getSelectedFile(event))}
      />
      {file ? <SelectedDocumentPreview file={file} onClear={onClear} /> : null}
    </div>
  )
}

function TransactionDocumentsPanel({
  transactionId,
  readOnly,
}: {
  transactionId: number
  readOnly?: boolean
}) {
  const queryClient = useQueryClient()
  const documentsQuery = useTransactionDocumentsQuery(transactionId, {
    enabled: Number.isInteger(transactionId),
  })
  const uploadDocumentMutation = useUploadTransactionDocumentMutation()
  const deleteDocumentMutation = useDeleteDocumentMutation()
  const [documentError, setDocumentError] = useState<string | null>(null)
  const [documentPendingDeletion, setDocumentPendingDeletion] =
    useState<DocumentRead | null>(null)
  const isMutating =
    uploadDocumentMutation.isPending || deleteDocumentMutation.isPending

  async function handleUpload(file: File | null) {
    if (!file) return

    try {
      setDocumentError(null)
      await uploadDocumentMutation.mutateAsync({ transactionId, file })
      invalidateDocumentQueries(queryClient, transactionId)
      notifySuccess('Document ajouté à la transaction.')
    } catch (error) {
      const message = getApiErrorMessage(error)
      setDocumentError(message)
      notifyError(`Impossible d’ajouter le document. ${message}`)
    }
  }

  async function handleDownload(document: DocumentRead) {
    try {
      setDocumentError(null)
      await downloadDocument(document.id, document.original_filename)
    } catch (error) {
      const message = getApiErrorMessage(error)
      setDocumentError(message)
      notifyError(`Impossible de télécharger le document. ${message}`)
    }
  }

  async function handleDelete(document: DocumentRead) {
    try {
      setDocumentError(null)
      await deleteDocumentMutation.mutateAsync({ documentId: document.id })
      invalidateDocumentQueries(queryClient, transactionId)
      setDocumentPendingDeletion(null)
      notifySuccess('Document supprimé.')
    } catch (error) {
      const message = getApiErrorMessage(error)
      setDocumentError(message)
      notifyError(`Impossible de supprimer le document. ${message}`)
    }
  }

  const documents = documentsQuery.data ?? []
  const hasAttachedDocuments = documents.length > 0
  const canUploadDocument =
    !readOnly &&
    documentsQuery.isSuccess &&
    !hasAttachedDocuments &&
    !documentsQuery.isFetching

  return (
    <div className="space-y-3 rounded-md border border-border p-4">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <Paperclip className="h-4 w-4 text-muted-foreground" aria-hidden />
        Documents
      </div>

      {documentsQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">
          Chargement des documents
        </p>
      ) : documentsQuery.isError ? (
        <p className="text-sm text-destructive">
          {getApiErrorMessage(documentsQuery.error)}
        </p>
      ) : canUploadDocument ? (
        <Input
          type="file"
          accept={documentInputAccept}
          disabled={isMutating}
          onChange={(event) => {
            const file = getSelectedFile(event)
            event.currentTarget.value = ''
            void handleUpload(file)
          }}
        />
      ) : null}

      {documentsQuery.isSuccess && documents.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun document joint.</p>
      ) : null}

      {documents.length > 0 ? (
        <div className="space-y-2">
          {documents.map((document) => (
            <div
              key={document.id}
              className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium text-foreground">
                  {document.original_filename}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatFileSize(document.file_size)}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  type="button"
                  onClick={() => void handleDownload(document)}
                >
                  <Download aria-hidden />
                  Télécharger
                </Button>
                {readOnly ? null : (
                  <Button
                    size="sm"
                    variant="outline"
                    type="button"
                    disabled={isMutating}
                    onClick={() => {
                      setDocumentError(null)
                      setDocumentPendingDeletion(document)
                    }}
                  >
                    <Trash2 aria-hidden />
                    Supprimer
                  </Button>
                )}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {documentError && !documentPendingDeletion ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {documentError}
        </p>
      ) : null}

      {documentPendingDeletion ? (
        <ConfirmationDialog
          title="Supprimer ce document ?"
          description="Ce document sera retiré de la transaction associée."
          error={documentError}
          isPending={deleteDocumentMutation.isPending}
          onCancel={() => {
            if (deleteDocumentMutation.isPending) return
            setDocumentPendingDeletion(null)
            setDocumentError(null)
          }}
          onConfirm={() => void handleDelete(documentPendingDeletion)}
        >
          <p className="font-medium text-foreground">
            {documentPendingDeletion.original_filename}
          </p>
          <p className="mt-1 text-muted-foreground">
            {formatFileSize(documentPendingDeletion.file_size)}
          </p>
        </ConfirmationDialog>
      ) : null}
    </div>
  )
}

function ModalShell({
  title,
  icon,
  headerActions,
  children,
  size = 'wide',
  onClose,
}: {
  title: string
  icon: ReactNode
  headerActions?: ReactNode
  children: ReactNode
  size?: 'compact' | 'wide'
  onClose: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-3 py-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={cn(
          'flex max-h-[92vh] w-full flex-col overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-xl',
          size === 'compact' ? 'max-w-4xl' : 'max-w-5xl',
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gold/15 text-gold">
              {icon}
            </span>
            <div className="min-w-0">
              <p className="text-base font-semibold">{title}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {headerActions}
            <Button
              size="icon"
              variant="ghost"
              aria-label="Fermer"
              onClick={onClose}
            >
              <X aria-hidden />
            </Button>
          </div>
        </div>
        <div className="overflow-y-auto px-5 py-4 text-sm">{children}</div>
      </div>
    </div>
  )
}

export function TransactionModal({
  project,
  product,
  budgetLine,
  initialStructure,
  suppliers,
  onClose,
}: TransactionModalProps) {
  const queryClient = useQueryClient()
  const createBudgetLineTransactionMutation =
    useCreateBudgetLineTransactionMutation()
  const createProductTransactionMutation = useCreateProductTransactionMutation()
  const [form, setForm] = useState<TransactionFormState>(() =>
    createInitialFormState(initialStructure),
  )
  const [amountSource, setAmountSource] = useState<AmountSource>('ht')
  const [documentFile, setDocumentFile] = useState<File | null>(null)
  const [createdTransactionForDocument, setCreatedTransactionForDocument] =
    useState<CreatedTransactionForDocument | null>(null)
  const [mutationError, setMutationError] = useState<string | null>(null)
  const uploadDocumentMutation = useUploadTransactionDocumentMutation()
  const isProductScoped = !budgetLine
  const canTargetBudgetLine = form.transaction_type !== 'invoice'
  const canSelectAsBudget = canSelectCreatedTransactionAsBudget(form)
  const isSubmitting =
    createBudgetLineTransactionMutation.isPending ||
    createProductTransactionMutation.isPending ||
    uploadDocumentMutation.isPending

  function updateField<K extends keyof TransactionFormState>(
    key: K,
    value: TransactionFormState[K],
  ) {
    const nextAmountSource =
      key === 'amount_ttc' ? 'ttc' : key === 'amount_ht' ? 'ht' : amountSource
    if (key === 'amount_ttc' || key === 'amount_ht') {
      setAmountSource(nextAmountSource)
    }

    setForm((current) => {
      const next = { ...current, [key]: value }
      if (key === 'amount_ht' || key === 'amount_ttc' || key === 'vat_rate') {
        return recalculateAmounts(next, nextAmountSource)
      }

      return next
    })
    setMutationError(null)
  }

  function updateQuoteStatus(quoteStatus: QuoteStatus) {
    setForm((current) => ({
      ...current,
      quote_status: quoteStatus,
      select_as_budget: quoteStatus === 'validated',
    }))
    setMutationError(null)
  }

  function getSelectAsBudgetHint() {
    if (
      form.transaction_type === 'quote' &&
      form.quote_status !== 'validated'
    ) {
      return 'Validez le devis pour pouvoir le sélectionner comme budget.'
    }
    return 'Le montant contribuera au budget sélectionné de ce poste.'
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
          ? 'Transaction ajoutée avec son document.'
          : 'Transaction ajoutée.',
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
      title="Ajouter une transaction"
      icon={<FilePlus2 className="h-5 w-5" aria-hidden="true" />}
      onClose={onClose}
    >
      <form className="space-y-4" onSubmit={handleSubmit}>
        <TransactionContextSummary
          project={project}
          product={product}
          budgetLine={budgetLine}
        />

        <div className="space-y-3 rounded-md border border-border p-4">
          <h3 className="text-xs font-semibold uppercase text-muted-foreground">
            Transaction
          </h3>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Type" htmlFor="transaction-type">
              <Select
                id="transaction-type"
                value={form.transaction_type}
                onChange={(event) =>
                  setForm((current) =>
                    normalizeForType(
                      current,
                      event.target.value as TransactionType,
                    ),
                  )
                }
              >
                {Object.entries(transactionTypeLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Fournisseur" htmlFor="transaction-supplier">
              <Select
                id="transaction-supplier"
                value={form.supplier_id}
                onChange={(event) =>
                  updateField('supplier_id', event.target.value)
                }
              >
                <option value="">Aucun fournisseur</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Montant HT" htmlFor="transaction-amount-ht">
              <Input
                id="transaction-amount-ht"
                type="number"
                min="0"
                step="0.01"
                value={form.amount_ht}
                onChange={(event) =>
                  updateField('amount_ht', event.target.value)
                }
                required
              />
            </Field>
            <Field label="TVA (%)" htmlFor="transaction-vat-rate">
              <Input
                id="transaction-vat-rate"
                type="number"
                min="0"
                step="0.01"
                value={form.vat_rate}
                onChange={(event) =>
                  updateField('vat_rate', event.target.value)
                }
              />
            </Field>
            <Field label="Montant TVA" htmlFor="transaction-amount-vat">
              <Input
                id="transaction-amount-vat"
                type="number"
                min="0"
                step="0.01"
                value={form.amount_vat}
                disabled
                readOnly
              />
            </Field>
            <Field label="Montant TTC" htmlFor="transaction-amount-ttc">
              <Input
                id="transaction-amount-ttc"
                type="number"
                min="0"
                step="0.01"
                value={form.amount_ttc}
                onChange={(event) =>
                  updateField('amount_ttc', event.target.value)
                }
                required
              />
            </Field>
            <Field label="Date" htmlFor="transaction-issued-date">
              <Input
                id="transaction-issued-date"
                type="date"
                value={form.issued_date}
                onChange={(event) =>
                  updateField('issued_date', event.target.value)
                }
                required
              />
            </Field>

            {form.transaction_type === 'quote' ? (
              <>
                <Field label="Statut devis" htmlFor="transaction-quote-status">
                  <Select
                    id="transaction-quote-status"
                    value={form.quote_status}
                    onChange={(event) =>
                      updateQuoteStatus(event.target.value as QuoteStatus)
                    }
                  >
                    {Object.entries(quoteStatusLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Date d'échéance" htmlFor="transaction-due-date">
                  <Input
                    id="transaction-due-date"
                    type="date"
                    value={form.due_date}
                    onChange={(event) =>
                      updateField('due_date', event.target.value)
                    }
                  />
                </Field>
              </>
            ) : null}

            {form.transaction_type === 'invoice' ? (
              <>
                <Field
                  label="Statut facture"
                  htmlFor="transaction-invoice-status"
                >
                  <Select
                    id="transaction-invoice-status"
                    value={form.invoice_status}
                    onChange={(event) =>
                      updateField(
                        'invoice_status',
                        event.target.value as InvoiceStatus,
                      )
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
                </Field>
                <Field label="Type facture" htmlFor="transaction-invoice-type">
                  <Select
                    id="transaction-invoice-type"
                    value={form.invoice_type}
                    onChange={(event) =>
                      updateField(
                        'invoice_type',
                        event.target.value as InvoiceType,
                      )
                    }
                  >
                    {Object.entries(invoiceTypeLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field
                  label="Moyen de paiement"
                  htmlFor="transaction-payment-method"
                >
                  <Select
                    id="transaction-payment-method"
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
                </Field>
                <Field label="Date d'échéance" htmlFor="transaction-due-date">
                  <Input
                    id="transaction-due-date"
                    type="date"
                    value={form.due_date}
                    onChange={(event) =>
                      updateField('due_date', event.target.value)
                    }
                  />
                </Field>
                <Field
                  label="Date de paiement"
                  htmlFor="transaction-payment-date"
                >
                  <Input
                    id="transaction-payment-date"
                    type="date"
                    value={form.payment_date}
                    onChange={(event) =>
                      updateField('payment_date', event.target.value)
                    }
                  />
                </Field>
              </>
            ) : null}
          </div>

          <div className="mt-4 space-y-4">
            {isProductScoped && canTargetBudgetLine ? (
              <div className="grid gap-4 md:grid-cols-2">
                <Field
                  label="Portée budget"
                  htmlFor="transaction-budget-concern"
                >
                  <Select
                    id="transaction-budget-concern"
                    value={form.budget_concern}
                    onChange={(event) =>
                      updateField(
                        'budget_concern',
                        event.target.value as BudgetConcern,
                      )
                    }
                  >
                    <option value="entire_product">Produit entier</option>
                    <option value="specific_element">Sous-produit</option>
                  </Select>
                </Field>
                {form.budget_concern === 'specific_element' ? (
                  <Field
                    label="Nom du sous-produit"
                    htmlFor="transaction-budget-line-name"
                  >
                    <Input
                      id="transaction-budget-line-name"
                      value={form.budget_line_name}
                      onChange={(event) =>
                        updateField('budget_line_name', event.target.value)
                      }
                      required
                    />
                  </Field>
                ) : null}
              </div>
            ) : null}

            {form.transaction_type === 'invoice' ? null : (
              <div
                className={cn(
                  'rounded-md border p-3',
                  canSelectAsBudget
                    ? 'border-border bg-background'
                    : 'border-border bg-muted/40',
                )}
              >
                <label className="flex items-start gap-3 text-sm">
                  <Checkbox
                    checked={canSelectAsBudget && form.select_as_budget}
                    disabled={!canSelectAsBudget}
                    onChange={(event) =>
                      updateField('select_as_budget', event.target.checked)
                    }
                  />
                  <span>
                    <span className="block font-medium text-foreground">
                      Sélectionner comme budget
                    </span>
                    <span className="mt-1 block text-muted-foreground">
                      {getSelectAsBudgetHint()}
                    </span>
                  </span>
                </label>
              </div>
            )}

            <Field label="Description" htmlFor="transaction-description">
              <Input
                id="transaction-description"
                value={form.description}
                onChange={(event) =>
                  updateField('description', event.target.value)
                }
              />
            </Field>

            <NewTransactionDocumentField
              file={documentFile}
              disabled={isSubmitting}
              onFileChange={(file) => {
                setDocumentFile(file)
                setMutationError(null)
              }}
              onClear={() => setDocumentFile(null)}
            />
          </div>
        </div>

        {mutationError ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {mutationError}
          </div>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Annuler
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Création...' : 'Créer'}
          </Button>
        </div>
      </form>
    </ModalShell>
  )
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
  const [form, setForm] = useState<TransactionUpdateFormState>(() =>
    createInitialUpdateFormState(transaction),
  )
  const [amountSource, setAmountSource] = useState<AmountSource>('ht')
  const [mutationError, setMutationError] = useState<string | null>(null)
  const [localIsBudgetSelected, setLocalIsBudgetSelected] =
    useState(isBudgetSelected)
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
    (isEditing && isQuote && form.quote_status === 'validated')

  function updateField<K extends keyof TransactionUpdateFormState>(
    key: K,
    value: TransactionUpdateFormState[K],
  ) {
    const nextAmountSource =
      key === 'amount_ttc' ? 'ttc' : key === 'amount_ht' ? 'ht' : amountSource
    if (key === 'amount_ttc' || key === 'amount_ht') {
      setAmountSource(nextAmountSource)
    }

    setForm((current) => {
      const next = { ...current, [key]: value }
      if (key === 'amount_ht' || key === 'amount_ttc' || key === 'vat_rate') {
        return recalculateAmounts(next, nextAmountSource)
      }

      return next
    })
    setMutationError(null)
  }

  function updateInvoiceStatus(invoiceStatus: InvoiceStatus) {
    setForm((current) => ({
      ...current,
      invoice_status: invoiceStatus,
      payment_date: invoiceStatus === 'paid' ? current.payment_date : '',
    }))
    setMutationError(null)
  }

  function resetEditMode() {
    setForm(createInitialUpdateFormState(transaction))
    setAmountSource('ht')
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
        if (
          isQuote &&
          form.quote_status === 'validated' &&
          transaction.quote_status !== 'validated'
        ) {
          await updateTransactionMutation.mutateAsync({
            projectId,
            budgetLineId,
            transactionId,
            transaction: { quote_status: 'validated' },
          })
        }

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
      size="compact"
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
    >
      <form className="space-y-4 text-sm" onSubmit={handleSubmit}>
        <TransactionContextSummary
          project={project}
          product={product}
          budgetLine={budgetLine}
        />

        <CompactSection title="Transaction">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Date" htmlFor="review-transaction-issued-date">
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
                onChange={(event) =>
                  updateField('issued_date', event.target.value)
                }
                required
              />
            </Field>
            <Field label="Fournisseur" htmlFor="review-transaction-supplier">
              {isEditing ? (
                <Select
                  id="review-transaction-supplier"
                  className="h-9 text-sm"
                  value={form.supplier_id}
                  onChange={(event) =>
                    updateField('supplier_id', event.target.value)
                  }
                >
                  <option value="">Aucun fournisseur</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
                </Select>
              ) : (
                <Input
                  id="review-transaction-supplier"
                  className="h-9 text-sm"
                  value={transaction.supplier_name ?? selectedSupplierName}
                  readOnly
                />
              )}
            </Field>
            <div>
              <p className="text-xs font-medium">Type</p>
              <div className="mt-1 flex h-9 items-center rounded-md border border-input bg-muted/30 px-3">
                <StatusBadge status={transaction.transaction_type} />
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
                  {Object.entries(invoiceStatusLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              ) : (
                <div className="flex h-9 items-center rounded-md border border-input bg-muted/30 px-3">
                  {isQuote && transaction.quote_status ? (
                    <StatusBadge status={transaction.quote_status} />
                  ) : isInvoice && transaction.invoice_status ? (
                    <StatusBadge status={transaction.invoice_status} />
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
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
                value={isEditing ? form.vat_rate : `${transaction.vat_rate} %`}
                readOnly={!isEditing}
                onChange={(event) =>
                  updateField('vat_rate', event.target.value)
                }
              />
            </Field>
            <Field label="Montant TVA" htmlFor="review-transaction-amount-vat">
              <Input
                id="review-transaction-amount-vat"
                className="h-9 text-sm"
                value={
                  isEditing
                    ? form.amount_vat
                    : formatCurrency(transaction.amount_vat)
                }
                readOnly
                disabled={isEditing}
              />
            </Field>
            <Field label="Montant TTC" htmlFor="review-transaction-amount-ttc">
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
                    isEditing ? form.due_date : formatDate(transaction.due_date)
                  }
                  readOnly={!isEditing}
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
                            : '-'
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
                            : '-'
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
            <Field label="Description" htmlFor="review-transaction-description">
              <Input
                id="review-transaction-description"
                className="h-9 text-sm"
                value={form.description}
                readOnly={!isEditing}
                onChange={(event) =>
                  updateField('description', event.target.value)
                }
              />
            </Field>
            {isInvoice ? null : (
              <label className="flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm">
                <Checkbox
                  checked={localIsBudgetSelected}
                  disabled={
                    readOnly || !canToggleBudgetSelectionFromForm || isMutating
                  }
                  onChange={handleBudgetSelectionToggle}
                />
                Sélectionné pour budget
              </label>
            )}
          </div>
        </CompactSection>

        {Number.isInteger(Number(transaction.id)) ? (
          <TransactionDocumentsPanel
            transactionId={Number(transaction.id)}
            readOnly={readOnly}
          />
        ) : null}

        {mutationError ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {mutationError}
          </div>
        ) : null}

        {isEditing ? (
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              type="button"
              onClick={resetEditMode}
              disabled={isMutating}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={isMutating}>
              {isMutating ? 'Enregistrement...' : 'Enregistrer'}
            </Button>
          </div>
        ) : null}
      </form>
    </ModalShell>
  )
}
