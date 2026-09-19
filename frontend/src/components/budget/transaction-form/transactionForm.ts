// Pure form state, labels and payload builders for the transaction modals.
// No React in here so the money maths can be unit-tested directly.

import type {
  TransactionCreate,
  TransactionCreateForProduct,
  TransactionUpdate,
} from '@/api/types'
import type {
  BudgetLine,
  InvoiceStatus,
  InvoiceType,
  PaymentMethod,
  Product,
  QuoteStatus,
  Transaction,
  TransactionType,
} from '@/types'

export type AmountSource = 'ht' | 'ttc'

export type AmountFields = {
  amount_ht: string
  vat_rate: string
  amount_vat: string
  amount_ttc: string
}

export type TransactionFormState = {
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
}

// What a new transaction can start from, e.g. an invoice for a quote.
export type TransactionPrefill = Partial<
  Pick<
    TransactionFormState,
    'supplier_id' | 'amount_ttc' | 'vat_rate' | 'description' | 'invoice_type'
  >
>

export type TransactionUpdateFormState = {
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
  transaction: Transaction
  product: Product
  budgetLine: BudgetLine
}

export const transactionTypeLabels: Record<TransactionType, string> = {
  quote: 'Devis',
  diy_estimate: 'Estimation DIY',
  invoice: 'Facture',
}

export const newTransactionTitles: Record<TransactionType, string> = {
  quote: 'Nouveau devis',
  diy_estimate: 'Nouvelle estimation DIY',
  invoice: 'Nouvelle facture',
}

export const createTransactionLabels: Record<TransactionType, string> = {
  quote: 'Créer le devis',
  diy_estimate: 'Créer l’estimation',
  invoice: 'Créer la facture',
}

// The French rates a construction budget meets; any other can be typed.
export const vatRatePresets = ['20', '10', '5.5', '0'] as const

export const issuedDateLabels: Record<TransactionType, string> = {
  quote: 'Date du devis',
  diy_estimate: 'Date de l’estimation',
  invoice: 'Date de facture',
}

export const quoteStatusLabels: Record<QuoteStatus, string> = {
  to_confirm: 'En attente',
  to_negotiate: 'À négocier',
  validated: 'Validé',
  rejected: 'Rejeté',
}

export const invoiceStatusLabels: Record<InvoiceStatus, string> = {
  unpaid: 'Impayée',
  on_hold: 'En attente',
  paid: 'Payée',
}

export const invoiceTypeLabels: Record<InvoiceType, string> = {
  full: 'Complète',
  deposit: 'Acompte',
  interim: 'Intermédiaire',
  balance: 'Solde',
}

export const paymentMethodLabels: Record<PaymentMethod, string> = {
  cash: 'Espèces',
  card: 'Carte',
  wire: 'Virement',
}

// Where a transaction sits, for a modal's subtitle.
export function transactionBreadcrumb(
  product: Product,
  budgetLine?: BudgetLine,
) {
  return [
    product.category_name,
    product.subcategory_name,
    product.product_name,
    budgetLine?.item_type === 'breakdown' ? budgetLine.name : null,
  ]
    .filter(Boolean)
    .join(' › ')
}

export function todayAsInputValue() {
  return new Date().toISOString().slice(0, 10)
}

export function emptyToNull(value: string) {
  return value.trim() === '' ? null : value
}

export function optionalDecimal(value: string) {
  return emptyToNull(value)
}

export function optionalId(value: string) {
  if (value.trim() === '') return null
  const parsed = Number(value)
  return Number.isInteger(parsed) ? parsed : null
}

export function requiredId(value: string, label: string) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed)) {
    throw new Error(`${label} invalide`)
  }

  return parsed
}

export function formatNumberInput(value: number | null | undefined) {
  return value == null ? '' : String(value)
}

export function parseAmountInput(value: string) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function formatCalculatedAmount(value: number) {
  return (Math.round(value * 100) / 100).toFixed(2)
}

export function recalculateAmounts<T extends AmountFields>(
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

// A paid invoice needs a payment date, never before the invoice date.
export function defaultPaymentDate(issuedDate: string) {
  const today = todayAsInputValue()
  return issuedDate > today ? issuedDate : today
}

export function createInitialFormState({
  transactionType = 'quote',
  selectAsBudget = false,
  prefill,
}: {
  transactionType?: TransactionType
  selectAsBudget?: boolean
  prefill?: TransactionPrefill
} = {}): TransactionFormState {
  const state: TransactionFormState = {
    transaction_type: transactionType,
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
    select_as_budget: transactionType !== 'invoice' && selectAsBudget,
    ...prefill,
  }

  return prefill?.amount_ttc ? recalculateAmounts(state, 'ttc') : state
}

// An invoice for a quote: same supplier, rate and description, and what is
// left to invoice on that quote (its amount minus the supplier's invoices
// already on the line). A later invoice for the same quote is most likely
// the balance.
export function invoicePrefillFromQuote(
  quote: Transaction,
  lineTransactions: Transaction[],
): TransactionPrefill {
  const invoicedTtc = lineTransactions
    .filter(
      (transaction) =>
        transaction.transaction_type === 'invoice' &&
        transaction.supplier_id === quote.supplier_id,
    )
    .reduce((total, transaction) => total + transaction.amount_ttc, 0)
  const remainingTtc = Math.round((quote.amount_ttc - invoicedTtc) * 100) / 100

  return {
    supplier_id: quote.supplier_id ?? '',
    vat_rate: formatNumberInput(quote.vat_rate),
    description: quote.description,
    amount_ttc: remainingTtc > 0 ? formatCalculatedAmount(remainingTtc) : '',
    invoice_type: invoicedTtc > 0 ? 'balance' : 'full',
  }
}

export function createInitialUpdateFormState(
  transaction: Transaction,
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

export function normalizeForType(
  state: TransactionFormState,
  transactionType: TransactionType,
): TransactionFormState {
  if (transactionType === 'invoice') {
    return {
      ...state,
      transaction_type: transactionType,
      quote_status: 'to_confirm',
      select_as_budget: false,
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
    select_as_budget: false,
  }
}

export function canSelectCreatedTransactionAsBudget(
  form: TransactionFormState,
) {
  if (form.transaction_type === 'diy_estimate') return true
  return form.transaction_type === 'quote' && form.quote_status !== 'rejected'
}

export function buildTransactionUpdate(
  transaction: Transaction,
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

export function buildTransactionCreate({
  form,
}: {
  form: TransactionFormState
}): TransactionCreate {
  const payload: TransactionCreate = {
    // A self-built estimate has no supplier, whatever the field held before
    // switching type.
    supplier_id:
      form.transaction_type === 'diy_estimate'
        ? null
        : optionalId(form.supplier_id),
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
    payload.payment_date =
      form.invoice_status === 'paid' ? emptyToNull(form.payment_date) : null
  }

  return payload
}

export function buildProductTransactionCreate(
  form: TransactionFormState,
): TransactionCreateForProduct {
  const payload: TransactionCreateForProduct = buildTransactionCreate({ form })

  // A product's first quote or estimate opens its single budget line;
  // splitting it into sub-products is an explicit action of its own.
  if (form.transaction_type !== 'invoice') {
    payload.budget_concern = 'entire_product'
  }

  return payload
}
