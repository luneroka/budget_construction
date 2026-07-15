import type { Product, Transaction } from '@/types'

export type SubcategoryGroup = {
  name: string
  products: Product[]
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

export function formatSelectedBudgetSource(transactions: Transaction[]) {
  const quoteCount = transactions.filter(
    (transaction) =>
      transaction.transaction_type === 'quote' && transaction.select_as_budget,
  ).length
  const diyCount = transactions.filter(
    (transaction) =>
      transaction.transaction_type === 'diy_estimate' &&
      transaction.select_as_budget,
  ).length
  const parts = [
    quoteCount > 0 ? `${quoteCount} devis` : null,
    diyCount > 0
      ? `${diyCount} estimation${diyCount > 1 ? 's' : ''} DIY`
      : null,
  ].filter(Boolean)

  return parts.length > 0 ? parts.join(' + ') : 'Aucun budget sélectionné'
}

export function canToggleBudgetSelection(transaction: Transaction) {
  if (transaction.transaction_type === 'diy_estimate') return true
  return (
    transaction.transaction_type === 'quote' &&
    transaction.quote_status !== 'rejected'
  )
}

export function groupProductsBySubcategory(
  products: Product[],
): SubcategoryGroup[] {
  const groups = new Map<string, Product[]>()

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

export function getWholeProductBudgetLine(product: Product) {
  const [line] = product.budget_lines
  return product.budget_lines.length === 1 && line?.item_type === 'product'
    ? line
    : null
}

export function isProductEmpty(product: Product) {
  return (
    product.budget_lines.length === 0 ||
    product.budget_lines.every(
      (line) =>
        line.quote_count === 0 &&
        line.diy_estimate_count === 0 &&
        line.invoice_count === 0 &&
        line.selected_budget_amount_ttc === 0 &&
        line.actual_cost_amount_ttc === 0 &&
        line.diy_estimate_amount_ttc === 0,
    )
  )
}
