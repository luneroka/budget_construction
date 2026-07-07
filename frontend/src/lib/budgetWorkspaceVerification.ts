import type {
  ApiDecimal,
  FinancialTotalsRead,
  ProductFinancialSummaryRead,
  ProjectFinancialSummaryRead,
} from '@/api/types'

type VerificationIssue = {
  field: string
  expected: number
  actual: number
}

const MONEY_TOLERANCE = 0.01

function decimalToNumber(value: ApiDecimal | number | null | undefined): number {
  if (value == null) return 0
  return typeof value === 'number' ? value : Number(value)
}

function differs(left: number, right: number) {
  return Math.abs(left - right) > MONEY_TOLERANCE
}

function pushIssue(
  issues: VerificationIssue[],
  field: string,
  expected: number,
  actual: number,
) {
  if (differs(expected, actual)) {
    issues.push({ field, expected, actual })
  }
}

function verifyTotals(
  totals: FinancialTotalsRead,
  path: string,
): VerificationIssue[] {
  const issues: VerificationIssue[] = []
  const selectedBudget = decimalToNumber(totals.selected_budget_amount_ttc)
  const selectedQuoteBudget = decimalToNumber(
    totals.selected_quote_budget_amount_ttc,
  )
  const selectedDiyBudget = decimalToNumber(
    totals.selected_diy_budget_amount_ttc,
  )
  const actualCost = decimalToNumber(totals.actual_cost_amount_ttc)

  pushIssue(
    issues,
    `${path}.selected_budget_amount_ttc`,
    selectedQuoteBudget + selectedDiyBudget,
    selectedBudget,
  )
  pushIssue(
    issues,
    `${path}.selected_budget_variance_ttc`,
    selectedBudget - actualCost,
    decimalToNumber(totals.selected_budget_variance_ttc),
  )
  pushIssue(
    issues,
    `${path}.selected_quote_budget_variance_ttc`,
    selectedQuoteBudget - actualCost,
    decimalToNumber(totals.selected_quote_budget_variance_ttc),
  )

  return issues
}

function sumProducts(
  products: ProductFinancialSummaryRead[],
  field: keyof FinancialTotalsRead,
) {
  return products.reduce(
    (total, product) => total + decimalToNumber(product[field]),
    0,
  )
}

function sumBudgetLines(
  product: ProductFinancialSummaryRead,
  field: keyof FinancialTotalsRead,
) {
  return product.budget_lines.reduce(
    (total, budgetLine) => total + decimalToNumber(budgetLine[field]),
    0,
  )
}

export function verifyProjectFinancialSummary(
  summary: ProjectFinancialSummaryRead,
): VerificationIssue[] {
  const issues = verifyTotals(summary, 'project')
  const moneyFields: Array<keyof FinancialTotalsRead> = [
    'selected_budget_amount_ttc',
    'selected_quote_budget_amount_ttc',
    'selected_diy_budget_amount_ttc',
    'quote_amount_ttc',
    'validated_quote_amount_ttc',
    'diy_estimate_amount_ttc',
    'actual_cost_amount_ttc',
    'paid_invoice_amount_ttc',
    'unpaid_invoice_amount_ttc',
    'on_hold_invoice_amount_ttc',
    'selected_budget_variance_ttc',
    'selected_quote_budget_variance_ttc',
  ]
  const countFields: Array<keyof FinancialTotalsRead> = [
    'quote_count',
    'validated_quote_count',
    'diy_estimate_count',
    'invoice_count',
  ]

  summary.products.forEach((product) => {
    issues.push(...verifyTotals(product, `product.${product.product_id}`))

    moneyFields.forEach((field) => {
      pushIssue(
        issues,
        `product.${product.product_id}.${field}`,
        sumBudgetLines(product, field),
        decimalToNumber(product[field]),
      )
    })
    countFields.forEach((field) => {
      pushIssue(
        issues,
        `product.${product.product_id}.${field}`,
        sumBudgetLines(product, field),
        decimalToNumber(product[field]),
      )
    })
  })

  moneyFields.forEach((field) => {
    pushIssue(
      issues,
      `project.${field}`,
      sumProducts(summary.products, field),
      decimalToNumber(summary[field]),
    )
  })
  countFields.forEach((field) => {
    pushIssue(
      issues,
      `project.${field}`,
      sumProducts(summary.products, field),
      decimalToNumber(summary[field]),
    )
  })

  return issues
}
