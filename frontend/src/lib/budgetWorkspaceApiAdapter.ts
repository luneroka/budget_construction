import { useMemo } from 'react'

import { useBudgetLinesQuery } from '@/api/budget-lines'
import {
  useProjectFinancialSummaryQuery,
  useProjectQuery,
} from '@/api/projects'
import type {
  ApiDecimal,
  BudgetLineRead,
  FinancialTotalsRead,
  ProductFinancialSummaryRead,
  ProjectFinancialSummaryRead,
  ProjectRead,
  SupplierRead,
  TransactionRead,
} from '@/api/types'
import type {
  BudgetCategoryViewModel,
  BudgetLineSummaryViewModel,
  BudgetWorkspaceViewModel,
  FinancialSummaryViewModel,
  ProductSummaryViewModel,
  ProjectViewModel,
  SupplierRowViewModel,
  TransactionViewModel,
} from '@/demo/types'
import { verifyProjectFinancialSummary } from '@/lib/budgetWorkspaceVerification'

function decimalToNumber(
  value: ApiDecimal | number | null | undefined,
): number {
  if (value == null) return 0
  return typeof value === 'number' ? value : Number(value)
}

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

function projectToViewModel(
  project: ProjectRead,
  summary: ProjectFinancialSummaryRead,
): ProjectViewModel {
  return {
    id: String(project.id),
    user_id: String(project.user_id),
    template_id: project.template_id ?? 0,
    name: project.name,
    description: project.description ?? '',
    location: project.location ?? '',
    start_date: project.start_date ?? '',
    end_date: project.end_date ?? '',
    project_status: project.project_status,
    selected_budget_amount_ttc: decimalToNumber(
      summary.selected_budget_amount_ttc,
    ),
  }
}

function budgetLineToViewModel(
  budgetLine: ProductFinancialSummaryRead['budget_lines'][number],
): BudgetLineSummaryViewModel {
  return {
    budget_line_id: String(budgetLine.budget_line_id),
    name: budgetLine.name,
    item_type: budgetLine.item_type,
    selected_quote_transaction_id:
      budgetLine.selected_quote_transaction_id === null
        ? null
        : String(budgetLine.selected_quote_transaction_id),
    selected_diy_estimate_transaction_id:
      budgetLine.selected_diy_estimate_transaction_id === null
        ? null
        : String(budgetLine.selected_diy_estimate_transaction_id),
    ...totalsToNumbers(budgetLine),
    transactions: [],
  }
}

function productToViewModel(
  product: ProductFinancialSummaryRead,
): ProductSummaryViewModel {
  return {
    product_id: String(product.product_id),
    product_name: product.product_name,
    subcategory_name: product.subcategory_name,
    category_name: product.category_name,
    ...totalsToNumbers(product),
    budget_lines: product.budget_lines.map(budgetLineToViewModel),
  }
}

function buildCategories(
  products: ProductSummaryViewModel[],
  budgetLines: BudgetLineRead[],
): BudgetCategoryViewModel[] {
  const categoryIdsByName = new Map<string, string>()
  budgetLines.forEach((budgetLine) => {
    categoryIdsByName.set(
      budgetLine.product.category_name,
      String(budgetLine.product.category_id),
    )
  })

  const categories = new Map<string, BudgetCategoryViewModel>()

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
): BudgetWorkspaceViewModel {
  if (import.meta.env.DEV) {
    const verificationIssues = verifyProjectFinancialSummary(summary)
    if (verificationIssues.length > 0) {
      console.warn(
        'Budget financial summary verification failed',
        verificationIssues,
      )
    }
  }

  const products = summary.products.map(productToViewModel)
  const financialSummary: FinancialSummaryViewModel = {
    ...totalsToNumbers(summary),
    products,
  }

  return {
    project: projectToViewModel(project, summary),
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

export function transactionToViewModel(
  transaction: TransactionRead,
  budgetLine: BudgetLineSummaryViewModel,
  suppliers: SupplierRead[],
): TransactionViewModel {
  const supplier = suppliers.find(
    (candidate) => candidate.id === transaction.supplier_id,
  )
  const transactionId = String(transaction.id)

  return {
    id: transactionId,
    budget_line_id: String(transaction.budget_line_id),
    supplier_id:
      transaction.supplier_id === null ? null : String(transaction.supplier_id),
    supplier_name: supplier?.name ?? null,
    transaction_type: transaction.transaction_type,
    amount_ht: decimalToNumber(transaction.amount_ht),
    vat_rate: decimalToNumber(transaction.vat_rate),
    amount_vat: decimalToNumber(transaction.amount_vat),
    amount_ttc: decimalToNumber(transaction.amount_ttc),
    issued_date: transaction.issued_date,
    due_date: transaction.due_date,
    payment_date: transaction.payment_date,
    created_at: transaction.created_at,
    updated_at: transaction.updated_at,
    deleted_at: transaction.deleted_at,
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
}

export function suppliersToViewModel(
  suppliers: SupplierRead[] | undefined,
): SupplierRowViewModel[] {
  return (suppliers ?? []).map((supplier) => ({
    id: String(supplier.id),
    user_id: String(supplier.user_id),
    name: supplier.name,
    siret: supplier.siret,
    comment: supplier.comment ?? '',
    contacts: supplier.contacts.map((contact) => ({
      id: String(contact.id),
      supplier_id: String(contact.supplier_id),
      name: contact.name,
      phone_number: contact.phone_number,
      email: contact.email,
      is_primary: contact.is_primary,
      created_at: contact.created_at,
      updated_at: contact.updated_at,
    })),
    created_at: supplier.created_at,
    updated_at: supplier.updated_at,
    deleted_at: supplier.deleted_at,
  }))
}

export function useBudgetWorkspaceQuery(projectId: number | null) {
  const projectQuery = useProjectQuery(projectId, { enabled: true })
  const financialSummaryQuery = useProjectFinancialSummaryQuery(projectId, {
    enabled: true,
  })
  const budgetLinesQuery = useBudgetLinesQuery(projectId, { enabled: true })

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
