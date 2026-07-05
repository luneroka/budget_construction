import type {
  InvoiceStatus,
  ProductSummaryViewModel,
  TransactionType,
  TransactionViewModel,
} from '@/demo/types'

export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

export function parseAmount(value: string): number {
  return Number.parseFloat(value)
}

export function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0)
}

export function sumProducts(
  products: ProductSummaryViewModel[],
  key: keyof Pick<
    ProductSummaryViewModel,
    | 'selected_budget_amount_ttc'
    | 'actual_cost_amount_ttc'
    | 'paid_invoice_amount_ttc'
    | 'unpaid_invoice_amount_ttc'
    | 'on_hold_invoice_amount_ttc'
    | 'selected_budget_variance_ttc'
  >,
): number {
  return sum(products.map((product) => product[key]))
}

export function countTransactions(
  transactions: TransactionViewModel[],
  transactionType: TransactionType,
): number {
  return transactions.filter(
    (transaction) => transaction.transaction_type === transactionType,
  ).length
}

export function sumInvoicesByStatus(
  transactions: TransactionViewModel[],
  invoiceStatus: InvoiceStatus,
): number {
  return sum(
    transactions
      .filter(
        (transaction) =>
          transaction.transaction_type === 'invoice' &&
          transaction.invoice_status === invoiceStatus,
      )
      .map((transaction) => transaction.amount_ttc),
  )
}
