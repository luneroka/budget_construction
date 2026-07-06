import type {
  BudgetLineSummaryViewModel,
  ProductSummaryViewModel,
  TransactionViewModel,
} from '@/demo/types'

export type BudgetSelectionState = {
  selected_quote_transaction_id: string | null
  selected_diy_estimate_transaction_id: string | null
}

export type SubcategoryGroup = {
  name: string
  products: ProductSummaryViewModel[]
  selected_budget_amount_ttc: number
  actual_cost_amount_ttc: number
  paid_invoice_amount_ttc: number
  unpaid_invoice_amount_ttc: number
  selected_budget_variance_ttc: number
}

export function varianceClass(value: number) {
  if (value < 0) return 'text-destructive'
  if (value > 0) return 'text-success'
  return 'text-muted-foreground'
}

function getSelectedBudgetParts(line: BudgetLineSummaryViewModel) {
  const selectedQuote = line.transactions.find(
    (transaction) => transaction.id === line.selected_quote_transaction_id,
  )
  const selectedDiyEstimate = line.transactions.find(
    (transaction) =>
      transaction.id === line.selected_diy_estimate_transaction_id,
  )

  return {
    selectedQuote,
    selectedDiyEstimate,
  }
}

export function formatSelectedBudgetSource(line: BudgetLineSummaryViewModel) {
  const { selectedQuote, selectedDiyEstimate } = getSelectedBudgetParts(line)
  const parts = [
    selectedQuote ? '1 devis' : null,
    selectedDiyEstimate ? '1 estimation DIY' : null,
  ].filter(Boolean)

  return parts.length > 0 ? parts.join(' + ') : 'Aucun budget sélectionné'
}

export function canToggleBudgetSelection(transaction: TransactionViewModel) {
  if (transaction.transaction_type === 'diy_estimate') return true
  return (
    transaction.transaction_type === 'quote' &&
    transaction.quote_status === 'validated'
  )
}

export function isSelectedBudgetTransaction(
  transaction: TransactionViewModel,
  selection: BudgetSelectionState,
) {
  return (
    transaction.id === selection.selected_quote_transaction_id ||
    transaction.id === selection.selected_diy_estimate_transaction_id
  )
}

export function applyBudgetSelection(
  line: BudgetLineSummaryViewModel,
  selection: BudgetSelectionState,
): BudgetLineSummaryViewModel {
  return {
    ...line,
    selected_quote_transaction_id: selection.selected_quote_transaction_id,
    selected_diy_estimate_transaction_id:
      selection.selected_diy_estimate_transaction_id,
  }
}

export function createBudgetSelections(
  products: ProductSummaryViewModel[],
): Record<string, BudgetSelectionState> {
  const selections: Record<string, BudgetSelectionState> = {}
  products.forEach((product) => {
    product.budget_lines.forEach((line) => {
      selections[line.budget_line_id] = {
        selected_quote_transaction_id: line.selected_quote_transaction_id,
        selected_diy_estimate_transaction_id:
          line.selected_diy_estimate_transaction_id,
      }
    })
  })
  return selections
}

export function groupProductsBySubcategory(
  products: ProductSummaryViewModel[],
): SubcategoryGroup[] {
  const groups = new Map<string, ProductSummaryViewModel[]>()

  products.forEach((product) => {
    const currentProducts = groups.get(product.subcategory_name) ?? []
    currentProducts.push(product)
    groups.set(product.subcategory_name, currentProducts)
  })

  return [...groups.entries()].map(([name, groupProducts]) => ({
    name,
    products: groupProducts,
    selected_budget_amount_ttc: groupProducts.reduce(
      (total, product) => total + product.selected_budget_amount_ttc,
      0,
    ),
    actual_cost_amount_ttc: groupProducts.reduce(
      (total, product) => total + product.actual_cost_amount_ttc,
      0,
    ),
    paid_invoice_amount_ttc: groupProducts.reduce(
      (total, product) => total + product.paid_invoice_amount_ttc,
      0,
    ),
    unpaid_invoice_amount_ttc: groupProducts.reduce(
      (total, product) => total + product.unpaid_invoice_amount_ttc,
      0,
    ),
    selected_budget_variance_ttc: groupProducts.reduce(
      (total, product) => total + product.selected_budget_variance_ttc,
      0,
    ),
  }))
}

export function getWholeProductBudgetLine(product: ProductSummaryViewModel) {
  const [line] = product.budget_lines
  return product.budget_lines.length === 1 && line?.item_type === 'product'
    ? line
    : null
}

export function isProductEmpty(product: ProductSummaryViewModel) {
  return (
    product.budget_lines.length === 0 ||
    product.budget_lines.every(
      (line) =>
        line.transactions.length === 0 &&
        line.selected_budget_amount_ttc === 0 &&
        line.actual_cost_amount_ttc === 0 &&
        line.diy_estimate_amount_ttc === 0,
    )
  )
}
