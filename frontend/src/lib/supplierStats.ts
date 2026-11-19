import type { Transaction } from '@/types'

export type SupplierTotals = {
  /** « Devis retenus »: the validated quotes. */
  retainedTtc: number
  invoicedTtc: number
  paidTtc: number
  /** « Reste à facturer »: Devis retenus − Facturé. */
  remainingTtc: number
  /** Invoiced beyond the retained quotes: a dépassement. */
  isOverrun: boolean
  quoteCount: number
  invoiceCount: number
}

const EMPTY: SupplierTotals = {
  retainedTtc: 0,
  invoicedTtc: 0,
  paidTtc: 0,
  remainingTtc: 0,
  isOverrun: false,
  quoteCount: 0,
  invoiceCount: 0,
}

// What a supplier costs in the project, by the lots rules: what was committed
// to them (the active validated quotes), what they have invoiced (every
// active invoice), what is left to invoice, and what is paid.
export function supplierTotals(transactions: Transaction[]): SupplierTotals {
  const totals = transactions.reduce<SupplierTotals>((current, transaction) => {
    if (transaction.deleted_at) return current

    if (transaction.transaction_type === 'invoice') {
      const isPaid = transaction.invoice_status === 'paid'
      return {
        ...current,
        invoicedTtc: current.invoicedTtc + transaction.amount_ttc,
        paidTtc: current.paidTtc + (isPaid ? transaction.amount_ttc : 0),
        invoiceCount: current.invoiceCount + 1,
      }
    }

    return {
      ...current,
      retainedTtc:
        current.retainedTtc +
        (transaction.quote_status === 'validated' ? transaction.amount_ttc : 0),
      quoteCount: current.quoteCount + 1,
    }
  }, EMPTY)

  const remainingTtc = totals.retainedTtc - totals.invoicedTtc
  return { ...totals, remainingTtc, isOverrun: remainingTtc < 0 }
}
