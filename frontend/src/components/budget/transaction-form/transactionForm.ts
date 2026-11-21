// Pure form state, labels and payload builders for the transaction modals.
// No React in here so the money maths can be unit-tested directly.

import type { TransactionCreate, TransactionUpdate } from '@/api/types'
import type {
  InvoiceStatus,
  InvoiceType,
  PaymentMethod,
  QuoteStatus,
  Transaction,
  TransactionType,
} from '@/types'
import { lotLabel } from '@/lib/transactionWorkspace'

export type AmountSource = 'ht' | 'ttc'

export type AmountFields = {
  amount_ht: string
  vat_rate: string
  amount_vat: string
  amount_ttc: string
}

export type TransactionFormState = {
  transaction_type: TransactionType
  lot_id: string
  supplier_id: string
  title: string
  reference: string
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

// What a new transaction can start from, e.g. an invoice for a quote.
export type TransactionPrefill = Partial<
  Pick<
    TransactionFormState,
    'lot_id' | 'supplier_id' | 'title' | 'amount_ht' | 'vat_rate'
  >
>

export type TransactionUpdateFormState = {
  lot_id: string
  supplier_id: string
  title: string
  reference: string
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
}

export const transactionTypeLabels: Record<TransactionType, string> = {
  quote: 'Devis',
  invoice: 'Facture',
}

export const newTransactionTitles: Record<TransactionType, string> = {
  quote: 'Nouveau devis',
  invoice: 'Nouvelle facture',
}

export const createTransactionLabels: Record<TransactionType, string> = {
  quote: 'Créer le devis',
  invoice: 'Créer la facture',
}

// The limits the API enforces on the libellé and the référence.
export const TITLE_MAX_LENGTH = 255
export const REFERENCE_MAX_LENGTH = 100

// The French rates a construction budget meets; any other can be typed.
export const vatRatePresets = ['20', '10', '5.5', '0'] as const

export const issuedDateLabels: Record<TransactionType, string> = {
  quote: 'Date du devis',
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

// Where a transaction sits, for a modal's subtitle: its lot.
export function transactionBreadcrumb(
  lot: { code: string; designation: string } | null | undefined,
) {
  return lot ? lotLabel(lot) : ''
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
  if (value.trim() === '' || !Number.isInteger(parsed)) {
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

// Whether a form still holds what it started with, field by field.
export function isSameFormState<T extends object>(left: T, right: T) {
  return (Object.keys(left) as (keyof T)[]).every(
    (key) => left[key] === right[key],
  )
}

// A paid invoice needs a payment date, never before the invoice date.
export function defaultPaymentDate(issuedDate: string) {
  const today = todayAsInputValue()
  return issuedDate > today ? issuedDate : today
}

export function createInitialFormState({
  transactionType = 'quote',
  lotId = '',
  prefill,
}: {
  transactionType?: TransactionType
  lotId?: string
  prefill?: TransactionPrefill
} = {}): TransactionFormState {
  const state: TransactionFormState = {
    transaction_type: transactionType,
    lot_id: lotId,
    supplier_id: '',
    title: '',
    reference: '',
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
    ...prefill,
  }

  return prefill?.amount_ht ? recalculateAmounts(state, 'ht') : state
}

// « Ajouter une facture pour ce devis »: the invoice form starts from the
// quote's lot, supplier, libellé, VAT rate and amount HT, all editable. The
// invoice saved is an ordinary one, with no link to the quote.
export function invoicePrefillFromQuote(
  quote: Transaction,
): TransactionPrefill {
  return {
    lot_id: String(quote.lot_id),
    supplier_id: quote.supplier_id ?? '',
    title: quote.title ?? '',
    vat_rate: formatNumberInput(quote.vat_rate),
    amount_ht: formatCalculatedAmount(quote.amount_ht),
  }
}

export function createInitialUpdateFormState(
  transaction: Transaction,
): TransactionUpdateFormState {
  return {
    lot_id: String(transaction.lot_id),
    supplier_id: transaction.supplier_id ?? '',
    title: transaction.title ?? '',
    reference: transaction.reference ?? '',
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
    }
  }

  return {
    ...state,
    transaction_type: transactionType,
    payment_date: '',
    invoice_status: 'unpaid',
    invoice_type: 'full',
    payment_method: 'wire',
  }
}

export function buildTransactionUpdate(
  transaction: Transaction,
  form: TransactionUpdateFormState,
): TransactionUpdate {
  const payload: TransactionUpdate = {
    lot_id: requiredId(form.lot_id, 'Lot'),
    supplier_id: optionalId(form.supplier_id),
    title: emptyToNull(form.title),
    reference: emptyToNull(form.reference),
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
    lot_id: requiredId(form.lot_id, 'Lot'),
    supplier_id: optionalId(form.supplier_id),
    transaction_type: form.transaction_type,
    title: emptyToNull(form.title),
    reference: emptyToNull(form.reference),
    amount_ht: form.amount_ht,
    vat_rate: optionalDecimal(form.vat_rate),
    amount_vat: optionalDecimal(form.amount_vat),
    amount_ttc: optionalDecimal(form.amount_ttc),
    issued_date: form.issued_date,
    description: emptyToNull(form.description),
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
