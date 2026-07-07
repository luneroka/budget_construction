import { type ReactNode, type SyntheticEvent, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ClipboardList, Download, Edit3, Eye, FilePlus2 } from 'lucide-react'

import { invalidateBudgetWorkspaceQueries } from '@/api/budget-workspace-cache'
import { getApiErrorMessage } from '@/api/client'
import {
  useCreateBudgetLineTransactionMutation,
  useCreateProductTransactionMutation,
  useSelectBudgetCandidateMutation,
  useUnselectBudgetCandidateMutation,
  useUpdateBudgetLineTransactionMutation,
} from '@/api/transactions'
import type {
  TransactionCreate,
  TransactionCreateForProduct,
  TransactionUpdate,
} from '@/api/types'
import { SectionCard } from '@/components/shared/SectionCard'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
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
import { formatCurrency, formatDate } from '@/lib/format'
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

function ModalShell({
  title,
  icon,
  children,
  size = 'wide',
  onClose,
}: {
  title: string
  icon: ReactNode
  children: ReactNode
  size?: 'compact' | 'wide'
  onClose: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 px-4 py-6"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={cn(
          'flex max-h-[92vh] w-full flex-col overflow-hidden rounded-lg border border-border bg-background text-foreground shadow-lg',
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
          <Button size="sm" variant="outline" onClick={onClose}>
            Fermer
          </Button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
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
  const [mutationError, setMutationError] = useState<string | null>(null)
  const isProductScoped = !budgetLine
  const canTargetBudgetLine = form.transaction_type !== 'invoice'
  const canSelectAsBudget = canSelectCreatedTransactionAsBudget(form)
  const isSubmitting =
    createBudgetLineTransactionMutation.isPending ||
    createProductTransactionMutation.isPending

  const selectedSupplierName = useMemo(
    () =>
      suppliers.find((supplier) => supplier.id === form.supplier_id)?.name ??
      'Aucun fournisseur',
    [form.supplier_id, suppliers],
  )

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
    if (form.transaction_type === 'invoice') {
      return 'Les factures alimentent le réalisé et ne peuvent pas devenir budget sélectionné.'
    }
    if (form.transaction_type === 'quote' && form.quote_status !== 'validated') {
      return 'Validez le devis pour pouvoir le sélectionner comme budget.'
    }
    return 'Le montant contribuera au budget sélectionné de ce poste.'
  }

  async function handleSubmit(
    event: SyntheticEvent<HTMLFormElement, SubmitEvent>,
  ) {
    event.preventDefault()
    setMutationError(null)

    try {
      const projectId = requiredId(project.id, 'Projet')

      if (budgetLine) {
        const budgetLineId = requiredId(
          budgetLine.budget_line_id,
          'Ligne de budget',
        )
        await createBudgetLineTransactionMutation.mutateAsync({
          projectId,
          budgetLineId,
          transaction: buildTransactionCreate({ form }),
        })
        invalidateBudgetWorkspaceQueries(queryClient, projectId, budgetLineId)
      } else {
        const productId = requiredId(product.product_id, 'Produit')
        const createdTransaction =
          await createProductTransactionMutation.mutateAsync({
            projectId,
            productId,
            transaction: buildProductTransactionCreate(form),
          })
        invalidateBudgetWorkspaceQueries(
          queryClient,
          projectId,
          createdTransaction.budget_line_id,
        )
      }

      onClose()
    } catch (error) {
      setMutationError(getApiErrorMessage(error))
    }
  }

  return (
    <ModalShell
      title="Ajouter une transaction"
      icon={<FilePlus2 className="h-5 w-5" aria-hidden="true" />}
      onClose={onClose}
    >
      <form
        className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]"
        onSubmit={handleSubmit}
      >
        <div className="space-y-4">
          <SectionCard
            title="Contexte"
            description="Portée utilisée pour construire la route de création."
            icon={ClipboardList}
          >
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-xs font-medium text-muted-foreground uppercase">
                  Projet
                </dt>
                <dd className="mt-1 font-medium text-foreground">
                  {project.name}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground uppercase">
                  Produit
                </dt>
                <dd className="mt-1 font-medium text-foreground">
                  {product.product_name}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground uppercase">
                  Ligne de budget
                </dt>
                <dd className="mt-1 font-medium text-foreground">
                  {budgetLine?.name ?? 'Première transaction du produit'}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground uppercase">
                  Fournisseur
                </dt>
                <dd className="mt-1 text-foreground">{selectedSupplierName}</dd>
              </div>
            </dl>
          </SectionCard>

          <SectionCard title="Route API" icon={FilePlus2}>
            <div className="rounded-md border border-border bg-muted/30 p-3 text-xs">
              <p className="font-semibold text-foreground">POST</p>
              <p className="mt-1 wrap-break-words text-muted-foreground">
                {budgetLine
                  ? `/projects/${project.id}/budget-lines/${budgetLine.budget_line_id}/transactions/`
                  : `/projects/${project.id}/products/${product.product_id}/transactions/`}
              </p>
            </div>
          </SectionCard>
        </div>

        <div className="space-y-4">
          <SectionCard
            title="Transaction"
            description="Les champs affichés suivent les contraintes du backend."
            icon={FilePlus2}
          >
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
                  {Object.entries(transactionTypeLabels).map(
                    ([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ),
                  )}
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
                  <Field
                    label="Statut devis"
                    htmlFor="transaction-quote-status"
                  >
                    <Select
                      id="transaction-quote-status"
                      value={form.quote_status}
                      onChange={(event) =>
                        updateQuoteStatus(
                          event.target.value as QuoteStatus,
                        )
                      }
                    >
                      {Object.entries(quoteStatusLabels).map(
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
                  <Field
                    label="Type facture"
                    htmlFor="transaction-invoice-type"
                  >
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
                      {Object.entries(invoiceTypeLabels).map(
                        ([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ),
                      )}
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

              <Field label="Description" htmlFor="transaction-description">
                <Textarea
                  id="transaction-description"
                  value={form.description}
                  onChange={(event) =>
                    updateField('description', event.target.value)
                  }
                />
              </Field>
            </div>
          </SectionCard>

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
  const breadcrumbParts = [
    product.category_name,
    product.subcategory_name,
    product.product_name,
    budgetLine.item_type === 'product' ? null : budgetLine.name,
  ].filter(Boolean)

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
      onClose()
    } catch (error) {
      setMutationError(getApiErrorMessage(error))
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
    } catch (error) {
      setMutationError(getApiErrorMessage(error))
    }
  }

  return (
    <ModalShell
      title={isEditing ? 'Modifier la transaction' : 'Détails de la transaction'}
      icon={
        isEditing ? (
          <Edit3 className="h-5 w-5" aria-hidden="true" />
        ) : (
          <Eye className="h-5 w-5" aria-hidden="true" />
        )
      }
      size="compact"
      onClose={onClose}
    >
      <form className="space-y-4 text-sm" onSubmit={handleSubmit}>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <p className="min-w-0 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{project.name}</span>
            <span> - {breadcrumbParts.join(' > ')}</span>
          </p>
          {isEditing ? (
            <Button size="sm" variant="outline" type="button" onClick={resetEditMode}>
              Annuler
            </Button>
          ) : readOnly ? null : (
            <Button
              size="sm"
              variant="outline"
              type="button"
              onClick={() => setIsEditing(true)}
            >
              <Edit3 aria-hidden />
              Modifier
            </Button>
          )}
        </div>

        <CompactSection title="Données transaction">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Date" htmlFor="review-transaction-issued-date">
              <Input
                id="review-transaction-issued-date"
                className="h-9 text-sm"
                type={isEditing ? 'date' : 'text'}
                value={isEditing ? form.issued_date : formatDate(transaction.issued_date)}
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
                    updateField('quote_status', event.target.value as QuoteStatus)
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
                value={isEditing ? form.amount_ht : formatCurrency(transaction.amount_ht)}
                readOnly={!isEditing}
                onChange={(event) => updateField('amount_ht', event.target.value)}
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
                onChange={(event) => updateField('vat_rate', event.target.value)}
              />
            </Field>
            <Field label="Montant TVA" htmlFor="review-transaction-amount-vat">
              <Input
                id="review-transaction-amount-vat"
                className="h-9 text-sm"
                value={isEditing ? form.amount_vat : formatCurrency(transaction.amount_vat)}
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
                value={isEditing ? form.amount_ttc : formatCurrency(transaction.amount_ttc)}
                readOnly={!isEditing}
                onChange={(event) => updateField('amount_ttc', event.target.value)}
                required
              />
            </Field>
          </div>

          {isQuote || isInvoice ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Date d'échéance" htmlFor="review-transaction-due-date">
                <Input
                  id="review-transaction-due-date"
                  className="h-9 text-sm"
                  type={isEditing ? 'date' : 'text'}
                  value={isEditing ? form.due_date : formatDate(transaction.due_date)}
                  readOnly={!isEditing}
                  onChange={(event) => updateField('due_date', event.target.value)}
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
                  <Field label="Type facture" htmlFor="review-transaction-invoice-type">
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
                        {Object.entries(invoiceTypeLabels).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
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
                        {Object.entries(paymentMethodLabels).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
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
          <div className="grid gap-3 lg:grid-cols-[minmax(16rem,1fr)_13rem_minmax(12rem,auto)] lg:items-end">
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
            <div>
              <p className="text-xs font-medium">Document</p>
              {transaction.document_state === 'attached' ? (
                <div className="mt-1 flex h-9 gap-2">
                  <Button size="sm" variant="outline">
                    <Eye aria-hidden />
                    Voir
                  </Button>
                  <Button size="sm" variant="outline">
                    <Download aria-hidden />
                    Télécharger
                  </Button>
                </div>
              ) : (
                <div className="mt-1 flex h-9 items-center rounded-md border border-input bg-muted/30 px-3 text-sm text-muted-foreground">
                  Aucun
                </div>
              )}
            </div>
          </div>
        </CompactSection>

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
