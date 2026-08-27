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

export type ProductStructureChoice = 'single' | 'breakdown'
export type BudgetConcern = 'entire_product' | 'specific_element'
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
  budget_concern: BudgetConcern
  budget_line_name: string
}

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

export function createInitialFormState(
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

export function buildProductTransactionCreate(
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
