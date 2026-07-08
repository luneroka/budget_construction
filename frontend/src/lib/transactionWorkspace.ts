import type { ApiDecimal, ProjectTransactionRead } from '@/api/types'
import type {
  BudgetLineSummaryViewModel,
  ProductSummaryViewModel,
  TransactionViewModel,
} from '@/demo/types'
import { formatCurrency } from '@/lib/format'
import type { ViewedTransactionContext } from '@/components/budget/TransactionModal'

export type QuickViewId =
  | 'all'
  | 'unpaid_invoices'
  | 'quotes_to_confirm'
  | 'quotes_to_negotiate'
  | 'missing_documents'
  | 'recent'
  | 'budget_selected'
  | 'budget_not_selected'

export type TransactionWorkspaceRow = ViewedTransactionContext & {
  documentFilenames: string[]
  searchText: string
}

export const recentWindowDays = 30

export const quickViews: Array<{ id: QuickViewId; label: string }> = [
  { id: 'all', label: 'Toutes' },
  { id: 'unpaid_invoices', label: 'Factures impayées' },
  { id: 'quotes_to_negotiate', label: 'Devis à négocier' },
  { id: 'quotes_to_confirm', label: 'Devis à confirmer' },
  { id: 'missing_documents', label: 'Documents manquants' },
  { id: 'recent', label: 'Transactions récentes' },
  { id: 'budget_selected', label: 'Budget sélectionné' },
  { id: 'budget_not_selected', label: 'Budget non sélectionné' },
]

export const visibleQuickViews = quickViews.filter(
  (view) => view.id !== 'recent',
)

export const transactionTypeLabels: Record<
  TransactionViewModel['transaction_type'],
  string
> = {
  quote: 'Devis',
  diy_estimate: 'Estimation DIY',
  invoice: 'Facture',
}

export function decimalToNumber(value: ApiDecimal | number | null | undefined) {
  if (value == null) return 0
  return typeof value === 'number' ? value : Number(value)
}

export function getTransactionStatus(transaction: TransactionViewModel) {
  return transaction.quote_status ?? transaction.invoice_status
}

export function getBudgetLabel(
  product: ProductSummaryViewModel,
  budgetLine: BudgetLineSummaryViewModel,
) {
  const productName = product.product_name.trim()
  const budgetLineName = budgetLine.name.trim()

  if (productName.toLocaleLowerCase() === budgetLineName.toLocaleLowerCase()) {
    return product.product_name
  }

  return budgetLine.name
}

export function isBudgetSelected(transaction: TransactionViewModel) {
  return transaction.select_as_budget
}

function buildSearchText({
  product,
  budgetLine,
  transaction,
  documentFilenames,
}: TransactionWorkspaceRow) {
  return [
    transaction.supplier_name ?? 'Autoconstruction',
    product.category_name,
    product.product_name,
    budgetLine.name,
    transaction.transaction_type,
    transactionTypeLabels[transaction.transaction_type],
    String(transaction.amount_ttc),
    transaction.amount_ttc.toFixed(2),
    formatCurrency(transaction.amount_ttc),
    ...documentFilenames,
  ]
    .join(' ')
    .toLocaleLowerCase()
}

export function buildTransactionRow(
  transaction: ProjectTransactionRead,
): TransactionWorkspaceRow {
  const transactionId = String(transaction.id)
  const budgetLine: BudgetLineSummaryViewModel = {
    budget_line_id: String(transaction.budget_line_id),
    name: transaction.budget_line_name,
    item_type: transaction.budget_line_item_type,
    selected_quote_transaction_id:
      transaction.selected_quote_transaction_id === null
        ? null
        : String(transaction.selected_quote_transaction_id),
    selected_diy_estimate_transaction_id:
      transaction.selected_diy_estimate_transaction_id === null
        ? null
        : String(transaction.selected_diy_estimate_transaction_id),
    selected_budget_amount_ttc: 0,
    quote_amount_ttc: 0,
    validated_quote_amount_ttc: 0,
    diy_estimate_amount_ttc: 0,
    actual_cost_amount_ttc: 0,
    paid_invoice_amount_ttc: 0,
    unpaid_invoice_amount_ttc: 0,
    on_hold_invoice_amount_ttc: 0,
    selected_budget_variance_ttc: 0,
    quote_count: 0,
    validated_quote_count: 0,
    diy_estimate_count: 0,
    invoice_count: 0,
    transactions: [],
  }
  const product: ProductSummaryViewModel = {
    product_id: String(transaction.product_id),
    product_name: transaction.product_name,
    subcategory_name: transaction.subcategory_name,
    category_name: transaction.category_name,
    selected_budget_amount_ttc: 0,
    actual_cost_amount_ttc: 0,
    paid_invoice_amount_ttc: 0,
    unpaid_invoice_amount_ttc: 0,
    on_hold_invoice_amount_ttc: 0,
    selected_budget_variance_ttc: 0,
    budget_lines: [budgetLine],
  }
  const viewModel: TransactionViewModel = {
    id: transactionId,
    budget_line_id: String(transaction.budget_line_id),
    supplier_id:
      transaction.supplier_id === null ? null : String(transaction.supplier_id),
    supplier_name: transaction.supplier_name,
    transaction_type: transaction.transaction_type,
    amount_ht: decimalToNumber(transaction.amount_ht),
    vat_rate: decimalToNumber(transaction.vat_rate),
    amount_vat: decimalToNumber(transaction.amount_vat),
    amount_ttc: decimalToNumber(transaction.amount_ttc),
    issued_date: transaction.issued_date,
    due_date: transaction.due_date,
    payment_date: transaction.payment_date,
    description: transaction.description ?? '',
    quote_status: transaction.quote_status,
    invoice_status: transaction.invoice_status,
    invoice_type: transaction.invoice_type,
    payment_method: transaction.payment_method,
    select_as_budget:
      transactionId === budgetLine.selected_quote_transaction_id ||
      transactionId === budgetLine.selected_diy_estimate_transaction_id,
    document_state: transaction.has_documents ? 'attached' : 'missing',
  }
  const row = {
    budgetLine,
    documentFilenames: transaction.document_original_filenames,
    product,
    searchText: '',
    transaction: viewModel,
  }

  return {
    ...row,
    searchText: buildSearchText(row),
  }
}

function dateAtStart(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate())
}

export function isWithinLastDays(value: string, days: number, now = new Date()) {
  const issuedDate = dateAtStart(new Date(`${value}T00:00:00`))
  const today = dateAtStart(now)
  const cutoff = new Date(today)
  cutoff.setDate(today.getDate() - days + 1)

  return issuedDate >= cutoff && issuedDate <= today
}

export function isInCurrentMonth(value: string, now = new Date()) {
  const issuedDate = new Date(`${value}T00:00:00`)

  return (
    issuedDate.getFullYear() === now.getFullYear() &&
    issuedDate.getMonth() === now.getMonth()
  )
}

export function matchesQuickView(
  row: TransactionWorkspaceRow,
  quickView: QuickViewId,
) {
  const { transaction } = row

  if (quickView === 'unpaid_invoices') {
    return (
      transaction.transaction_type === 'invoice' &&
      transaction.invoice_status === 'unpaid'
    )
  }

  if (quickView === 'quotes_to_confirm') {
    return (
      transaction.transaction_type === 'quote' &&
      transaction.quote_status === 'to_confirm'
    )
  }

  if (quickView === 'quotes_to_negotiate') {
    return (
      transaction.transaction_type === 'quote' &&
      transaction.quote_status === 'to_negotiate'
    )
  }

  if (quickView === 'missing_documents') {
    return transaction.document_state === 'missing'
  }

  if (quickView === 'recent') {
    return isWithinLastDays(transaction.issued_date, recentWindowDays)
  }

  if (quickView === 'budget_selected') {
    return isBudgetSelected(transaction)
  }

  if (quickView === 'budget_not_selected') {
    return (
      ['quote', 'diy_estimate'].includes(transaction.transaction_type) &&
      !isBudgetSelected(transaction)
    )
  }

  return true
}
