import type {
  CatalogSeed,
  DashboardViewModel,
  InvoiceStatus,
  PowerBiSeed,
  TransactionType,
} from '@/demo/types'
import { buildBudgetWorkspace } from '@/demo/adapters/buildBudgetWorkspace'
import { sumInvoicesByStatus } from '@/demo/adapters/utils'

export function buildDashboard(
  catalogSeed: CatalogSeed,
  powerBiSeed: PowerBiSeed,
): DashboardViewModel {
  const workspace = buildBudgetWorkspace(catalogSeed, powerBiSeed)
  const transactionsByDate = [...workspace.transactions].sort((a, b) =>
    b.issued_date.localeCompare(a.issued_date),
  )
  const invoiceStatuses: InvoiceStatus[] = ['paid', 'unpaid', 'on_hold']
  const transactionTypes: TransactionType[] = ['quote', 'diy_estimate', 'invoice']
  const monthlyInvoiceMap = new Map<string, number>()

  workspace.transactions
    .filter((transaction) => transaction.transaction_type === 'invoice')
    .forEach((transaction) => {
      const month = transaction.issued_date.slice(0, 7)
      monthlyInvoiceMap.set(
        month,
        (monthlyInvoiceMap.get(month) ?? 0) + transaction.amount_ttc,
      )
    })

  return {
    project: workspace.project,
    financialSummary: workspace.financialSummary,
    recentTransactions: transactionsByDate.slice(0, 8),
    varianceProducts: [...workspace.financialSummary.products]
      .sort(
        (a, b) =>
          a.selected_budget_variance_ttc - b.selected_budget_variance_ttc,
      )
      .slice(0, 8),
    invoiceStatusTotals: invoiceStatuses.map((status) => ({
      status,
      amount_ttc: sumInvoicesByStatus(workspace.transactions, status),
    })),
    transactionCounts: transactionTypes.map((transactionType) => ({
      transaction_type: transactionType,
      count: workspace.transactions.filter(
        (transaction) => transaction.transaction_type === transactionType,
      ).length,
    })),
    monthlyInvoiceActivity: [...monthlyInvoiceMap.entries()]
      .sort(([monthA], [monthB]) => monthA.localeCompare(monthB))
      .map(([month, amount_ttc]) => ({ month, amount_ttc })),
    categoryBudgetActual: workspace.categories.map((category) => ({
      category_name: category.category_name,
      selected_budget_amount_ttc: category.selected_budget_amount_ttc,
      actual_cost_amount_ttc: category.actual_cost_amount_ttc,
    })),
  }
}
