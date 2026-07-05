import type {
  BudgetCategoryViewModel,
  BudgetWorkspaceViewModel,
  FinancialSummaryViewModel,
  ProductSummaryViewModel,
  TransactionViewModel,
} from '@/demo/types'
import { countTransactions, sum, sumProducts } from '@/demo/adapters/utils'

const emptyProducts = new Set([
  'Terrain & Préparation|Études & administratif|Achat terrain',
  'Second œuvre|Plomberie|Robinetterie',
  'Finitions|Salle de bain|Accessoires',
])

function productKey(product: ProductSummaryViewModel) {
  return [
    product.category_name,
    product.subcategory_name,
    product.product_name,
  ].join('|')
}

function resetProduct(
  product: ProductSummaryViewModel,
): ProductSummaryViewModel {
  return {
    ...product,
    selected_budget_amount_ttc: 0,
    actual_cost_amount_ttc: 0,
    paid_invoice_amount_ttc: 0,
    unpaid_invoice_amount_ttc: 0,
    on_hold_invoice_amount_ttc: 0,
    selected_budget_variance_ttc: 0,
    budget_lines: [],
  }
}

function summarizeCategory(
  category: BudgetCategoryViewModel,
  products: ProductSummaryViewModel[],
): BudgetCategoryViewModel {
  return {
    ...category,
    selected_budget_amount_ttc: sumProducts(
      products,
      'selected_budget_amount_ttc',
    ),
    actual_cost_amount_ttc: sumProducts(products, 'actual_cost_amount_ttc'),
    products,
  }
}

function summarizeFinancials(
  products: ProductSummaryViewModel[],
  transactions: TransactionViewModel[],
): FinancialSummaryViewModel {
  const selectedQuoteBudgetAmount = sum(
    transactions
      .filter(
        (transaction) =>
          transaction.select_as_budget &&
          transaction.transaction_type === 'quote',
      )
      .map((transaction) => transaction.amount_ttc),
  )
  const selectedDiyBudgetAmount = sum(
    transactions
      .filter(
        (transaction) =>
          transaction.select_as_budget &&
          transaction.transaction_type === 'diy_estimate',
      )
      .map((transaction) => transaction.amount_ttc),
  )
  const selectedBudgetAmount =
    selectedQuoteBudgetAmount + selectedDiyBudgetAmount
  const actualCostAmount = sumProducts(products, 'actual_cost_amount_ttc')
  const quoteAmount = sum(
    transactions
      .filter((transaction) => transaction.transaction_type === 'quote')
      .map((transaction) => transaction.amount_ttc),
  )
  const validatedQuoteAmount = sum(
    transactions
      .filter(
        (transaction) =>
          transaction.transaction_type === 'quote' &&
          transaction.quote_status === 'validated',
      )
      .map((transaction) => transaction.amount_ttc),
  )

  return {
    selected_budget_amount_ttc: selectedBudgetAmount,
    selected_quote_budget_amount_ttc: selectedQuoteBudgetAmount,
    selected_diy_budget_amount_ttc: selectedDiyBudgetAmount,
    quote_amount_ttc: quoteAmount,
    validated_quote_amount_ttc: validatedQuoteAmount,
    diy_estimate_amount_ttc: sum(
      transactions
        .filter(
          (transaction) => transaction.transaction_type === 'diy_estimate',
        )
        .map((transaction) => transaction.amount_ttc),
    ),
    actual_cost_amount_ttc: actualCostAmount,
    paid_invoice_amount_ttc: sumProducts(products, 'paid_invoice_amount_ttc'),
    unpaid_invoice_amount_ttc: sumProducts(
      products,
      'unpaid_invoice_amount_ttc',
    ),
    on_hold_invoice_amount_ttc: sumProducts(
      products,
      'on_hold_invoice_amount_ttc',
    ),
    selected_budget_variance_ttc: selectedBudgetAmount - actualCostAmount,
    selected_quote_budget_variance_ttc:
      selectedQuoteBudgetAmount - actualCostAmount,
    quote_count: countTransactions(transactions, 'quote'),
    validated_quote_count: transactions.filter(
      (transaction) =>
        transaction.transaction_type === 'quote' &&
        transaction.quote_status === 'validated',
    ).length,
    diy_estimate_count: countTransactions(transactions, 'diy_estimate'),
    invoice_count: countTransactions(transactions, 'invoice'),
    products,
  }
}

export function applyBudgetEmptyProductScenario(
  viewModel: BudgetWorkspaceViewModel,
): BudgetWorkspaceViewModel {
  const categories = viewModel.categories.map((category) => {
    const products = category.products.map((product) =>
      emptyProducts.has(productKey(product)) ? resetProduct(product) : product,
    )

    return summarizeCategory(category, products)
  })
  const products = categories.flatMap((category) => category.products)
  const transactions = products.flatMap((product) =>
    product.budget_lines.flatMap((line) => line.transactions),
  )
  const financialSummary = summarizeFinancials(products, transactions)

  return {
    ...viewModel,
    project: {
      ...viewModel.project,
      selected_budget_amount_ttc: financialSummary.selected_budget_amount_ttc,
    },
    categories,
    financialSummary,
    transactions,
  }
}
