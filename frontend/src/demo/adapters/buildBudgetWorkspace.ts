import type {
  BudgetCategoryViewModel,
  BudgetLineSummaryViewModel,
  BudgetWorkspaceViewModel,
  CatalogSeed,
  FinancialSummaryViewModel,
  PowerBiSeed,
  ProductSummaryViewModel,
  ProjectViewModel,
  SupplierRowViewModel,
  TemplateViewModel,
  TransactionViewModel,
} from '@/demo/types'
import { buildSuppliers } from '@/demo/adapters/buildSuppliers'
import {
  countTransactions,
  parseAmount,
  slugify,
  sum,
  sumInvoicesByStatus,
  sumProducts,
} from '@/demo/adapters/utils'

function buildProject(seed: PowerBiSeed, selectedBudgetAmount: number): ProjectViewModel {
  return {
    id: seed.project.key,
    user_id: seed.user.key,
    template_id: seed.project.source_template.id,
    name: seed.project.name,
    description: seed.project.description,
    location: seed.project.location,
    start_date: seed.project.start_date,
    end_date: seed.project.end_date,
    project_status: seed.project.project_status,
    selected_budget_amount_ttc: selectedBudgetAmount,
  }
}

function buildTemplates(seed: PowerBiSeed): TemplateViewModel[] {
  return [
    {
      id: seed.project.source_template.id,
      name: seed.project.source_template.name,
      project_id: seed.project.key,
    },
  ]
}

function findTransactionGroup(seed: PowerBiSeed, productName: string) {
  return seed.transactions_by_budget_line.find(
    (group) => group.budget_line_ref.product_name === productName,
  )
}

function buildTransactions(
  group: PowerBiSeed['transactions_by_budget_line'][number],
  budgetLineId: string,
  suppliersById: Map<string, SupplierRowViewModel>,
): TransactionViewModel[] {
  return group.transactions.map<TransactionViewModel>((transaction, index) => {
    const supplier = transaction.supplier_key
      ? suppliersById.get(transaction.supplier_key)
      : null

    return {
      id: `${budgetLineId}-transaction-${index + 1}`,
      budget_line_id: budgetLineId,
      supplier_id: supplier?.id ?? null,
      supplier_name: supplier?.name ?? null,
      transaction_type: transaction.transaction_type,
      amount_ht: parseAmount(transaction.amount_ht),
      vat_rate: parseAmount(transaction.vat_rate),
      amount_vat: parseAmount(transaction.amount_vat),
      amount_ttc: parseAmount(transaction.amount_ttc),
      issued_date: transaction.issued_date,
      due_date: transaction.due_date,
      payment_date: transaction.payment_date,
      description: transaction.description,
      quote_status: transaction.quote_status,
      invoice_status: transaction.invoice_status,
      invoice_type: transaction.transaction_type === 'invoice' ? 'full' : null,
      payment_method: transaction.payment_method,
      select_as_budget: transaction.select_as_budget,
      document_state: transaction.transaction_type === 'invoice' ? 'attached' : 'missing',
    }
  })
}

function buildBudgetLine(
  categoryName: string,
  subcategoryName: string,
  productName: string,
  transactions: TransactionViewModel[],
): BudgetLineSummaryViewModel {
  const budgetLineId = [
    'budget-line',
    slugify(categoryName),
    slugify(subcategoryName),
    slugify(productName),
  ].join('-')
  const selectedBudgetTransaction =
    transactions.find(
      (transaction) =>
        transaction.select_as_budget &&
        transaction.transaction_type !== 'invoice',
    ) ?? null
  const quotes = transactions.filter(
    (transaction) => transaction.transaction_type === 'quote',
  )
  const validatedQuotes = quotes.filter(
    (transaction) => transaction.quote_status === 'validated',
  )
  const diyEstimates = transactions.filter(
    (transaction) => transaction.transaction_type === 'diy_estimate',
  )
  const actualCostAmount = sumInvoicesByStatus(transactions, 'paid') +
    sumInvoicesByStatus(transactions, 'unpaid') +
    sumInvoicesByStatus(transactions, 'on_hold')
  const selectedBudgetAmount = selectedBudgetTransaction?.amount_ttc ?? 0

  return {
    budget_line_id: budgetLineId,
    name: productName,
    item_type: 'product',
    selected_budget_transaction_id: selectedBudgetTransaction?.id ?? null,
    selected_budget_amount_ttc: selectedBudgetAmount,
    quote_amount_ttc: sum(quotes.map((transaction) => transaction.amount_ttc)),
    validated_quote_amount_ttc: sum(
      validatedQuotes.map((transaction) => transaction.amount_ttc),
    ),
    diy_estimate_amount_ttc: sum(
      diyEstimates.map((transaction) => transaction.amount_ttc),
    ),
    actual_cost_amount_ttc: actualCostAmount,
    paid_invoice_amount_ttc: sumInvoicesByStatus(transactions, 'paid'),
    unpaid_invoice_amount_ttc: sumInvoicesByStatus(transactions, 'unpaid'),
    on_hold_invoice_amount_ttc: sumInvoicesByStatus(transactions, 'on_hold'),
    selected_budget_variance_ttc: selectedBudgetAmount - actualCostAmount,
    transactions,
  }
}

function productFromBudgetLine(
  categoryName: string,
  subcategoryName: string,
  productName: string,
  budgetLine: BudgetLineSummaryViewModel,
): ProductSummaryViewModel {
  return {
    product_id: slugify(`${categoryName}-${subcategoryName}-${productName}`),
    product_name: productName,
    subcategory_name: subcategoryName,
    category_name: categoryName,
    selected_budget_amount_ttc: budgetLine.selected_budget_amount_ttc,
    actual_cost_amount_ttc: budgetLine.actual_cost_amount_ttc,
    paid_invoice_amount_ttc: budgetLine.paid_invoice_amount_ttc,
    unpaid_invoice_amount_ttc: budgetLine.unpaid_invoice_amount_ttc,
    on_hold_invoice_amount_ttc: budgetLine.on_hold_invoice_amount_ttc,
    selected_budget_variance_ttc: budgetLine.selected_budget_variance_ttc,
    budget_lines: [budgetLine],
  }
}

function buildFinancialSummary(
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
        .filter((transaction) => transaction.transaction_type === 'diy_estimate')
        .map((transaction) => transaction.amount_ttc),
    ),
    actual_cost_amount_ttc: actualCostAmount,
    paid_invoice_amount_ttc: sumProducts(products, 'paid_invoice_amount_ttc'),
    unpaid_invoice_amount_ttc: sumProducts(products, 'unpaid_invoice_amount_ttc'),
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

export function buildBudgetWorkspace(
  catalogSeed: CatalogSeed,
  powerBiSeed: PowerBiSeed,
): BudgetWorkspaceViewModel {
  const suppliersById = new Map(
    buildSuppliers(powerBiSeed).suppliers.map((supplier) => [supplier.id, supplier]),
  )
  const allTransactions: TransactionViewModel[] = []
  const allProducts: ProductSummaryViewModel[] = []

  const categories = catalogSeed.map<BudgetCategoryViewModel>((category) => {
    const products = category.subcategories.flatMap((subcategory) =>
      subcategory.products.map((product) => {
        const group = findTransactionGroup(powerBiSeed, product.name)
        const budgetLineId = [
          'budget-line',
          slugify(category.name),
          slugify(subcategory.name),
          slugify(product.name),
        ].join('-')
        const transactions = group
          ? buildTransactions(group, budgetLineId, suppliersById)
          : []
        const budgetLine = buildBudgetLine(
          category.name,
          subcategory.name,
          product.name,
          transactions,
        )
        const productSummary = productFromBudgetLine(
          category.name,
          subcategory.name,
          product.name,
          budgetLine,
        )

        allTransactions.push(...transactions)
        allProducts.push(productSummary)

        return productSummary
      }),
    )

    return {
      category_id: slugify(category.name),
      category_name: category.name,
      selected_budget_amount_ttc: sumProducts(
        products,
        'selected_budget_amount_ttc',
      ),
      actual_cost_amount_ttc: sumProducts(products, 'actual_cost_amount_ttc'),
      products,
    }
  })

  const financialSummary = buildFinancialSummary(allProducts, allTransactions)

  return {
    project: buildProject(powerBiSeed, financialSummary.selected_budget_amount_ttc),
    templates: buildTemplates(powerBiSeed),
    categories,
    financialSummary,
    transactions: allTransactions,
  }
}
