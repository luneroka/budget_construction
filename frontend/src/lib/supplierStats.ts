import type { Transaction } from '@/types'

export type SupplierTotals = {
  /** Quotes and estimates kept as this product's budget. */
  retainedTtc: number
  invoicedTtc: number
  paidTtc: number
  /** Invoiced and not paid yet, whether unpaid or on hold. */
  toPayTtc: number
  quoteCount: number
  invoiceCount: number
}

const EMPTY: SupplierTotals = {
  retainedTtc: 0,
  invoicedTtc: 0,
  paidTtc: 0,
  toPayTtc: 0,
  quoteCount: 0,
  invoiceCount: 0,
}

// What a supplier costs in the project: what was committed to them (the
// quotes kept as budget), what they have invoiced, and what is paid of it.
export function supplierTotals(transactions: Transaction[]): SupplierTotals {
  const totals = transactions.reduce<SupplierTotals>((current, transaction) => {
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
        (transaction.select_as_budget ? transaction.amount_ttc : 0),
      quoteCount: current.quoteCount + 1,
    }
  }, EMPTY)

  return { ...totals, toPayTtc: totals.invoicedTtc - totals.paidTtc }
}
