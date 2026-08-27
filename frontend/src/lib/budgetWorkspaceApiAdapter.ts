import { useMemo } from 'react'

import { useBudgetLinesQuery } from '@/api/budget-lines'
import {
  useProjectFinancialSummaryQuery,
  useProjectQuery,
} from '@/api/projects'
import type {
  BudgetLineRead,
  FinancialTotalsRead,
  ProductFinancialSummaryRead,
  ProjectFinancialSummaryRead,
  ProjectRead,
} from '@/api/types'
import type {
  BudgetCategory,
  BudgetLine,
  BudgetWorkspace,
  FinancialSummary,
  Product,
} from '@/types'
import { decimalToNumber, projectToDomain } from '@/lib/apiAdapters'

function totalsToNumbers(totals: FinancialTotalsRead) {
  return {
    selected_budget_amount_ttc: decimalToNumber(
      totals.selected_budget_amount_ttc,
    ),
    selected_quote_budget_amount_ttc: decimalToNumber(
      totals.selected_quote_budget_amount_ttc,
    ),
    selected_diy_budget_amount_ttc: decimalToNumber(
      totals.selected_diy_budget_amount_ttc,
    ),
    quote_amount_ttc: decimalToNumber(totals.quote_amount_ttc),
    validated_quote_amount_ttc: decimalToNumber(
      totals.validated_quote_amount_ttc,
    ),
    diy_estimate_amount_ttc: decimalToNumber(totals.diy_estimate_amount_ttc),
    actual_cost_amount_ttc: decimalToNumber(totals.actual_cost_amount_ttc),
    paid_invoice_amount_ttc: decimalToNumber(totals.paid_invoice_amount_ttc),
    unpaid_invoice_amount_ttc: decimalToNumber(
      totals.unpaid_invoice_amount_ttc,
    ),
    on_hold_invoice_amount_ttc: decimalToNumber(
      totals.on_hold_invoice_amount_ttc,
    ),
    selected_budget_variance_ttc: decimalToNumber(
      totals.selected_budget_variance_ttc,
    ),
    selected_quote_budget_variance_ttc: decimalToNumber(
      totals.selected_quote_budget_variance_ttc,
    ),
    quote_count: totals.quote_count,
    validated_quote_count: totals.validated_quote_count,
    diy_estimate_count: totals.diy_estimate_count,
    invoice_count: totals.invoice_count,
  }
}

function budgetLineToDomain(
  budgetLine: ProductFinancialSummaryRead['budget_lines'][number],
): BudgetLine {
  return {
    budget_line_id: String(budgetLine.budget_line_id),
    name: budgetLine.name,
    item_type: budgetLine.item_type,
    ...totalsToNumbers(budgetLine),
    transactions: [],
  }
}

function productToDomain(product: ProductFinancialSummaryRead): Product {
  return {
    product_id: String(product.product_id),
    product_name: product.product_name,
    subcategory_name: product.subcategory_name,
    category_name: product.category_name,
    ...totalsToNumbers(product),
    budget_lines: product.budget_lines.map(budgetLineToDomain),
  }
}

function buildCategories(
  products: Product[],
  budgetLines: BudgetLineRead[],
): BudgetCategory[] {
  const categoryIdsByName = new Map<string, string>()
  budgetLines.forEach((budgetLine) => {
    categoryIdsByName.set(
      budgetLine.product.category_name,
      String(budgetLine.product.category_id),
    )
  })

  const categories = new Map<string, BudgetCategory>()

  products.forEach((product) => {
    const category = categories.get(product.category_name) ?? {
      category_id:
        categoryIdsByName.get(product.category_name) ?? product.category_name,
      category_name: product.category_name,
      selected_budget_amount_ttc: 0,
      actual_cost_amount_ttc: 0,
      products: [],
    }

    category.selected_budget_amount_ttc += product.selected_budget_amount_ttc
    category.actual_cost_amount_ttc += product.actual_cost_amount_ttc
    category.products.push(product)
    categories.set(product.category_name, category)
  })

  return [...categories.values()]
}

export function buildBudgetWorkspaceFromApi(
  project: ProjectRead,
  summary: ProjectFinancialSummaryRead,
  budgetLines: BudgetLineRead[],
): BudgetWorkspace {
  const products = summary.products.map(productToDomain)
  const financialSummary: FinancialSummary = {
    ...totalsToNumbers(summary),
    products,
  }

  return {
    project: projectToDomain(project, summary),
    templates: project.template_id
      ? [
          {
            id: project.template_id,
            name: '',
            project_id: String(project.id),
          },
        ]
      : [],
    categories: buildCategories(products, budgetLines),
    financialSummary,
    transactions: [],
  }
}

export function useBudgetWorkspaceQuery(projectId: number | null) {
  const projectQuery = useProjectQuery(projectId)
  const financialSummaryQuery = useProjectFinancialSummaryQuery(projectId)
  const budgetLinesQuery = useBudgetLinesQuery(projectId)

  const workspace = useMemo(() => {
    if (
      !projectQuery.data ||
      !financialSummaryQuery.data ||
      !budgetLinesQuery.data
    ) {
      return null
    }

    return buildBudgetWorkspaceFromApi(
      projectQuery.data,
      financialSummaryQuery.data,
      budgetLinesQuery.data,
    )
  }, [budgetLinesQuery.data, financialSummaryQuery.data, projectQuery.data])

  return {
    budgetLinesQuery,
    error:
      projectQuery.error ??
      financialSummaryQuery.error ??
      budgetLinesQuery.error ??
      null,
    financialSummaryQuery,
    isError:
      projectQuery.isError ||
      financialSummaryQuery.isError ||
      budgetLinesQuery.isError,
    isFetching:
      projectQuery.isFetching ||
      financialSummaryQuery.isFetching ||
      budgetLinesQuery.isFetching,
    isLoading:
      projectQuery.isLoading ||
      financialSummaryQuery.isLoading ||
      budgetLinesQuery.isLoading,
    projectQuery,
    workspace,
  }
}
