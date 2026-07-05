import type {
  BudgetCategoryViewModel,
  BudgetLineSummaryViewModel,
  BudgetWorkspaceViewModel,
  FinancialSummaryViewModel,
  InvoiceStatus,
  ProductSummaryViewModel,
  QuoteStatus,
  TransactionType,
  TransactionViewModel,
} from '@/demo/types'
import {
  countTransactions,
  slugify,
  sum,
  sumInvoicesByStatus,
  sumProducts,
} from '@/demo/adapters/utils'

type BreakdownItem = {
  name: string
  share: number
  invoiceStatus: InvoiceStatus
  quoteStatus?: QuoteStatus
}

type BreakdownExample = {
  categoryName: string
  subcategoryName: string
  productName: string
  items: BreakdownItem[]
}

const breakdownExamples: BreakdownExample[] = [
  {
    categoryName: 'Gros œuvre',
    subcategoryName: 'Fondations',
    productName: 'Béton fondations',
    items: [
      { name: "Béton prêt à l'emploi", share: 0.68, invoiceStatus: 'paid' },
      { name: 'Pompage béton', share: 0.2, invoiceStatus: 'unpaid' },
      {
        name: 'Livraison / attente toupie',
        share: 0.12,
        invoiceStatus: 'paid',
      },
    ],
  },
  {
    categoryName: 'Menuiseries',
    subcategoryName: 'Fenêtres',
    productName: 'Fenêtres',
    items: [
      { name: 'Châssis aluminium', share: 0.48, invoiceStatus: 'paid' },
      { name: 'Vitrage sécurité', share: 0.32, invoiceStatus: 'unpaid' },
      { name: 'Pose menuiseries', share: 0.2, invoiceStatus: 'paid' },
    ],
  },
  {
    categoryName: 'Second œuvre',
    subcategoryName: 'Électricité',
    productName: 'Tableau électrique',
    items: [
      { name: 'Coffret principal', share: 0.42, invoiceStatus: 'paid' },
      {
        name: 'Disjoncteurs et protections',
        share: 0.36,
        invoiceStatus: 'unpaid',
        quoteStatus: 'to_negotiate',
      },
      {
        name: "Main d'œuvre raccordement",
        share: 0.22,
        invoiceStatus: 'paid',
      },
    ],
  },
  {
    categoryName: 'Finitions',
    subcategoryName: 'Cuisine',
    productName: 'Meubles',
    items: [
      { name: 'Caissons cuisine', share: 0.5, invoiceStatus: 'paid' },
      { name: 'Façades et poignées', share: 0.28, invoiceStatus: 'unpaid' },
      { name: 'Pose cuisine', share: 0.22, invoiceStatus: 'paid' },
    ],
  },
]

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100
}

function distributeAmount(total: number, shares: number[]) {
  let allocated = 0

  return shares.map((share, index) => {
    if (index === shares.length - 1) {
      return roundCurrency(total - allocated)
    }

    const amount = roundCurrency(total * share)
    allocated += amount
    return amount
  })
}

function makeTransaction({
  amount,
  budgetLineId,
  description,
  index,
  invoiceStatus,
  selectAsBudget,
  transactionType,
}: {
  amount: number
  budgetLineId: string
  description: string
  index: number
  invoiceStatus?: InvoiceStatus
  selectAsBudget: boolean
  transactionType: TransactionType
}): TransactionViewModel {
  const vatRate = transactionType === 'diy_estimate' ? 0 : 20
  const amountHt =
    vatRate === 0 ? amount : roundCurrency(amount / (1 + vatRate / 100))

  return {
    id: `${budgetLineId}-scenario-transaction-${index}`,
    budget_line_id: budgetLineId,
    supplier_id: null,
    supplier_name:
      transactionType === 'diy_estimate' ? null : 'Fournisseur démo',
    transaction_type: transactionType,
    amount_ht: amountHt,
    vat_rate: vatRate,
    amount_vat: roundCurrency(amount - amountHt),
    amount_ttc: amount,
    issued_date: `2026-0${Math.min(index + 1, 9)}-15`,
    due_date:
      transactionType === 'invoice'
        ? `2026-0${Math.min(index + 2, 9)}-15`
        : null,
    payment_date:
      invoiceStatus === 'paid' ? `2026-0${Math.min(index + 2, 9)}-28` : null,
    description,
    quote_status: transactionType === 'quote' ? 'validated' : null,
    invoice_status:
      transactionType === 'invoice' ? (invoiceStatus ?? 'unpaid') : null,
    invoice_type: transactionType === 'invoice' ? 'full' : null,
    payment_method: transactionType === 'invoice' ? 'wire' : null,
    select_as_budget: selectAsBudget,
    document_state: transactionType === 'invoice' ? 'attached' : 'missing',
  }
}

function summarizeBudgetLine(
  budgetLineId: string,
  name: string,
  transactions: TransactionViewModel[],
): BudgetLineSummaryViewModel {
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
  const actualCostAmount =
    sumInvoicesByStatus(transactions, 'paid') +
    sumInvoicesByStatus(transactions, 'unpaid') +
    sumInvoicesByStatus(transactions, 'on_hold')
  const selectedBudgetAmount = selectedBudgetTransaction?.amount_ttc ?? 0

  return {
    budget_line_id: budgetLineId,
    name,
    item_type: 'breakdown',
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

function summarizeProduct(
  product: ProductSummaryViewModel,
  budgetLines: BudgetLineSummaryViewModel[],
): ProductSummaryViewModel {
  return {
    ...product,
    selected_budget_amount_ttc: sum(
      budgetLines.map((line) => line.selected_budget_amount_ttc),
    ),
    actual_cost_amount_ttc: sum(
      budgetLines.map((line) => line.actual_cost_amount_ttc),
    ),
    paid_invoice_amount_ttc: sum(
      budgetLines.map((line) => line.paid_invoice_amount_ttc),
    ),
    unpaid_invoice_amount_ttc: sum(
      budgetLines.map((line) => line.unpaid_invoice_amount_ttc),
    ),
    on_hold_invoice_amount_ttc: sum(
      budgetLines.map((line) => line.on_hold_invoice_amount_ttc),
    ),
    selected_budget_variance_ttc: sum(
      budgetLines.map((line) => line.selected_budget_variance_ttc),
    ),
    budget_lines: budgetLines,
  }
}

function buildBreakdownLines(
  product: ProductSummaryViewModel,
  example: BreakdownExample,
) {
  const [sourceLine] = product.budget_lines
  if (!sourceLine) return product.budget_lines

  const shares = example.items.map((item) => item.share)
  const budgets = distributeAmount(
    sourceLine.selected_budget_amount_ttc,
    shares,
  )
  const actuals = distributeAmount(sourceLine.actual_cost_amount_ttc, shares)
  const diyEstimates = distributeAmount(
    sourceLine.diy_estimate_amount_ttc,
    shares,
  )

  return example.items.map((item, itemIndex) => {
    const budgetLineId = [
      'budget-line',
      slugify(example.categoryName),
      slugify(example.subcategoryName),
      slugify(example.productName),
      slugify(item.name),
    ].join('-')
    const transactionIndex = itemIndex + 1
    const transactions = [
      makeTransaction({
        amount: budgets[itemIndex],
        budgetLineId,
        description: `Devis budget - ${item.name}`,
        index: transactionIndex,
        selectAsBudget: true,
        transactionType: 'quote',
      }),
      ...(diyEstimates[itemIndex] > 0
        ? [
            makeTransaction({
              amount: diyEstimates[itemIndex],
              budgetLineId,
              description: `Estimation autoconstruction - ${item.name}`,
              index: transactionIndex + 10,
              selectAsBudget: false,
              transactionType: 'diy_estimate' as const,
            }),
          ]
        : []),
      makeTransaction({
        amount: actuals[itemIndex],
        budgetLineId,
        description: `Facture scenario - ${item.name}`,
        index: transactionIndex + 20,
        invoiceStatus: item.invoiceStatus,
        selectAsBudget: false,
        transactionType: 'invoice',
      }),
    ]

    transactions[0] = {
      ...transactions[0],
      quote_status: item.quoteStatus ?? 'validated',
    }

    return summarizeBudgetLine(budgetLineId, item.name, transactions)
  })
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
  const selectedBudgetAmount =
    selectedQuoteBudgetAmount + selectedDiyBudgetAmount

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

function findExample(product: ProductSummaryViewModel) {
  return breakdownExamples.find(
    (example) =>
      example.categoryName === product.category_name &&
      example.subcategoryName === product.subcategory_name &&
      example.productName === product.product_name,
  )
}

export function applyBudgetBreakdownScenario(
  viewModel: BudgetWorkspaceViewModel,
): BudgetWorkspaceViewModel {
  const categories = viewModel.categories.map((category) => {
    const products = category.products.map((product) => {
      const example = findExample(product)
      if (!example) return product

      return summarizeProduct(product, buildBreakdownLines(product, example))
    })

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
