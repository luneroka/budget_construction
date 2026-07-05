import { type ReactNode, type SyntheticEvent, useMemo, useState } from 'react'
import { ClipboardList, Eye, FilePlus2 } from 'lucide-react'

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

type MockSubmission = {
  method: 'POST'
  route: string
  payload: Record<string, string | boolean | null>
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
    select_as_budget: true,
    budget_concern:
      initialStructure === 'breakdown' ? 'specific_element' : 'entire_product',
    budget_line_name: '',
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
      select_as_budget: true,
    }
  }

  return {
    ...state,
    transaction_type: transactionType,
    payment_date: '',
    invoice_status: 'unpaid',
    invoice_type: 'full',
    payment_method: 'wire',
    select_as_budget: true,
  }
}

function buildMockSubmission({
  project,
  product,
  budgetLine,
  form,
}: {
  project: ProjectViewModel
  product: ProductSummaryViewModel
  budgetLine?: BudgetLineSummaryViewModel
  form: TransactionFormState
}): MockSubmission {
  const route = budgetLine
    ? `/projects/${project.id}/budget-lines/${budgetLine.budget_line_id}/transactions/`
    : `/projects/${project.id}/products/${product.product_id}/transactions/`
  const payload: MockSubmission['payload'] = {
    supplier_id: emptyToNull(form.supplier_id),
    transaction_type: form.transaction_type,
    amount_ht: form.amount_ht,
    vat_rate: emptyToNull(form.vat_rate),
    amount_vat: emptyToNull(form.amount_vat),
    amount_ttc: emptyToNull(form.amount_ttc),
    issued_date: form.issued_date,
    description: emptyToNull(form.description),
    select_as_budget:
      form.transaction_type === 'invoice' ? false : form.select_as_budget,
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

  if (!budgetLine && form.transaction_type !== 'invoice') {
    payload.budget_concern = form.budget_concern
    if (form.budget_concern === 'specific_element') {
      payload.budget_line_name = emptyToNull(form.budget_line_name)
    }
  }

  return {
    method: 'POST',
    route,
    payload,
  }
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

function ModalShell({
  title,
  icon,
  children,
  onClose,
}: {
  title: string
  icon: ReactNode
  children: ReactNode
  onClose: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 px-4 py-6"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="max-h-full w-full max-w-5xl overflow-y-auto rounded-lg border border-border bg-background p-5 text-foreground shadow-lg">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-md bg-gold/15 text-gold">
              {icon}
            </span>
            <div className="min-w-0">
              <p className="font-heading text-xl font-semibold">{title}</p>
            </div>
          </div>
          <Button variant="outline" onClick={onClose}>
            Fermer
          </Button>
        </div>
        {children}
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
  const [form, setForm] = useState<TransactionFormState>(() =>
    createInitialFormState(initialStructure),
  )
  const [submission, setSubmission] = useState<MockSubmission | null>(null)
  const isProductScoped = !budgetLine
  const canSelectAsBudget = form.transaction_type !== 'invoice'

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
    setForm((current) => ({ ...current, [key]: value }))
    setSubmission(null)
  }

  function handleSubmit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault()
    setSubmission(buildMockSubmission({ project, product, budgetLine, form }))
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

          <SectionCard title="Route mock" icon={FilePlus2}>
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
                  onChange={(event) =>
                    updateField('amount_vat', event.target.value)
                  }
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
                        updateField(
                          'quote_status',
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
              {isProductScoped && canSelectAsBudget ? (
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
                      {canSelectAsBudget
                        ? 'Disponible pour les devis et les estimations DIY.'
                        : 'Les factures alimentent le réalisé et ne peuvent pas devenir budget sélectionné.'}
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

          {submission ? (
            <SectionCard title="Payload mock" icon={ClipboardList}>
              <div className="rounded-md border border-border bg-muted/30 p-3">
                <p className="text-xs font-semibold text-foreground">
                  {submission.method} {submission.route}
                </p>
                <pre className="mt-3 max-h-60 overflow-auto text-xs text-muted-foreground">
                  {JSON.stringify(submission.payload, null, 2)}
                </pre>
              </div>
            </SectionCard>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit">Créer en mock</Button>
          </div>
        </div>
      </form>
    </ModalShell>
  )
}

export function TransactionReviewModal({
  project,
  context,
  onClose,
}: TransactionReviewModalProps) {
  const { budgetLine, product, transaction } = context

  return (
    <ModalShell
      title="Détails de la transaction"
      icon={<Eye className="h-5 w-5" aria-hidden="true" />}
      onClose={onClose}
    >
      <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
        <SectionCard title="Contexte" icon={ClipboardList}>
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
                {budgetLine.name}
              </dd>
            </div>
          </dl>
        </SectionCard>

        <SectionCard title="Transaction" icon={Eye}>
          <dl className="grid gap-4 text-sm md:grid-cols-2">
            <div>
              <dt className="text-xs font-medium text-muted-foreground uppercase">
                Type
              </dt>
              <dd className="mt-1">
                <StatusBadge status={transaction.transaction_type} />
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted-foreground uppercase">
                Montant TTC
              </dt>
              <dd className="mt-1 font-semibold text-foreground">
                {formatCurrency(transaction.amount_ttc)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted-foreground uppercase">
                Date
              </dt>
              <dd className="mt-1 text-foreground">
                {formatDate(transaction.issued_date)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted-foreground uppercase">
                Fournisseur
              </dt>
              <dd className="mt-1 text-foreground">
                {transaction.supplier_name ?? 'Autoconstruction'}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted-foreground uppercase">
                Statut devis
              </dt>
              <dd className="mt-1">
                {transaction.quote_status ? (
                  <StatusBadge status={transaction.quote_status} />
                ) : (
                  <span className="text-muted-foreground">-</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted-foreground uppercase">
                Statut facture
              </dt>
              <dd className="mt-1">
                {transaction.invoice_status ? (
                  <StatusBadge status={transaction.invoice_status} />
                ) : (
                  <span className="text-muted-foreground">-</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted-foreground uppercase">
                Échéance
              </dt>
              <dd className="mt-1 text-foreground">
                {formatDate(transaction.due_date)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted-foreground uppercase">
                Paiement
              </dt>
              <dd className="mt-1 text-foreground">
                {formatDate(transaction.payment_date)}
              </dd>
            </div>
            <div className="md:col-span-2">
              <dt className="text-xs font-medium text-muted-foreground uppercase">
                Description
              </dt>
              <dd className="mt-1 text-foreground">
                {transaction.description}
              </dd>
            </div>
          </dl>
        </SectionCard>
      </div>
    </ModalShell>
  )
}
