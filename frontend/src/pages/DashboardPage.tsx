import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CircleDollarSign, Gauge, ReceiptText, WalletCards } from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  Treemap,
  XAxis,
  YAxis,
} from 'recharts'

import { getApiErrorMessage } from '@/api/client'
import {
  useProjectDashboardBudgetAlertsQuery,
  useProjectDashboardBudgetVsActualQuery,
  useProjectDashboardCategoryDistributionQuery,
  useProjectDashboardFinancialOverviewQuery,
  useProjectDashboardMissingDocumentsQuery,
  useProjectDashboardQuotesToConfirmQuery,
  useProjectDashboardQuotesToNegotiateQuery,
  useProjectDashboardRecentTransactionsQuery,
  useProjectDashboardSpendingOverTimeQuery,
  useProjectDashboardSupplierDistributionQuery,
  useProjectDashboardUnpaidInvoicesQuery,
  useProjectsQuery,
} from '@/api/projects'
import { useSuppliersQuery } from '@/api/suppliers'
import { useProjectTransactionsQuery } from '@/api/transactions'
import type { ProjectRead } from '@/api/types'
import type { TransactionReviewState } from '@/components/budget/types'
import { TransactionReviewModal } from '@/components/budget/TransactionModal'
import { ChartCard } from '@/components/shared/ChartCard'
import { KpiCard } from '@/components/shared/KpiCard'
import { PageHeader } from '@/components/shared/PageHeader'
import {
  ActionCenterWidget,
  BudgetAlertsWidgetContent,
  TransactionWidgetContent,
} from '@/components/dashboard/ActionCenter'
import {
  DashboardChartSkeleton,
  DashboardKpiSkeleton,
} from '@/components/dashboard/Skeletons'
import {
  DashboardChartMessage,
  DashboardMessage,
} from '@/components/dashboard/Messages'
import { CategoryTreemapNode } from '@/components/dashboard/TreemapNode'
import {
  chartColors,
  currencyTooltip,
  decimalToNumber,
  distributionColors,
  formatDashboardPercentage,
} from '@/components/dashboard/utils'
import { formatCurrency, formatMonth } from '@/lib/format'
import {
  suppliersToViewModel,
} from '@/lib/budgetWorkspaceApiAdapter'
import {
  canToggleBudgetSelection,
  isSelectedBudgetTransaction,
  type BudgetSelectionState,
} from '@/lib/budgetViewModel'
import {
  buildTransactionRow,
  type QuickViewId,
} from '@/lib/transactionWorkspace'
import { notifyError } from '@/lib/toasts'
import { useAppState } from '@/state/appState'
import type { ProjectViewModel } from '@/demo/types'

function projectToViewModel(project: ProjectRead): ProjectViewModel {
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
    selected_budget_amount_ttc: 0,
  }
}

function getBudgetSelection(
  state: TransactionReviewState | null,
): BudgetSelectionState {
  return {
    selected_quote_transaction_id:
      state?.context.budgetLine.selected_quote_transaction_id ?? null,
    selected_diy_estimate_transaction_id:
      state?.context.budgetLine.selected_diy_estimate_transaction_id ?? null,
  }
}

export function DashboardPage() {
  const { selectedProjectId } = useAppState()
  const navigate = useNavigate()
  const projectsQuery = useProjectsQuery({ enabled: true })
  const selectedProjectNumericId = selectedProjectId
    ? Number(selectedProjectId)
    : Number.NaN
  const fallbackProjectId = projectsQuery.data?.[0]?.id ?? null
  const projectId =
    Number.isInteger(selectedProjectNumericId) && selectedProjectNumericId > 0
      ? selectedProjectNumericId
      : fallbackProjectId
  const financialOverviewQuery = useProjectDashboardFinancialOverviewQuery(
    projectId,
    { enabled: true },
  )
  const spendingOverTimeQuery = useProjectDashboardSpendingOverTimeQuery(
    projectId,
    { enabled: true },
  )
  const budgetVsActualQuery = useProjectDashboardBudgetVsActualQuery(
    projectId,
    {
      enabled: true,
    },
  )
  const categoryDistributionQuery =
    useProjectDashboardCategoryDistributionQuery(projectId, { enabled: true })
  const supplierDistributionQuery =
    useProjectDashboardSupplierDistributionQuery(projectId, { enabled: true })
  const unpaidInvoicesQuery = useProjectDashboardUnpaidInvoicesQuery(
    projectId,
    {
      enabled: true,
    },
  )
  const quotesToConfirmQuery = useProjectDashboardQuotesToConfirmQuery(
    projectId,
    { enabled: true },
  )
  const quotesToNegotiateQuery = useProjectDashboardQuotesToNegotiateQuery(
    projectId,
    { enabled: true },
  )
  const missingDocumentsQuery = useProjectDashboardMissingDocumentsQuery(
    projectId,
    { enabled: true },
  )
  const recentTransactionsQuery = useProjectDashboardRecentTransactionsQuery(
    projectId,
    { enabled: true },
  )
  const budgetAlertsQuery = useProjectDashboardBudgetAlertsQuery(projectId, {
    enabled: true,
  })
  const transactionsQuery = useProjectTransactionsQuery(projectId, {
    enabled: true,
  })
  const suppliersQuery = useSuppliersQuery({ enabled: projectId !== null })
  const [transactionReview, setTransactionReview] =
    useState<TransactionReviewState | null>(null)
  const project = useMemo(() => {
    const selectedProject = projectsQuery.data?.find(
      (candidate) => candidate.id === projectId,
    )
    return selectedProject ? projectToViewModel(selectedProject) : null
  }, [projectId, projectsQuery.data])
  const suppliers = useMemo(
    () => suppliersToViewModel(suppliersQuery.data),
    [suppliersQuery.data],
  )
  const transactionRowsById = useMemo(
    () =>
      new Map(
        (transactionsQuery.data ?? []).map((transaction) => {
          const row = buildTransactionRow(transaction)
          return [transaction.id, row]
        }),
      ),
    [transactionsQuery.data],
  )
  const financialOverview = financialOverviewQuery.data
  const variance = decimalToNumber(
    financialOverview?.selected_budget_variance_ttc,
  )
  const spendingOverTimeData = (spendingOverTimeQuery.data ?? []).map(
    (item) => ({
      ...item,
      label: formatMonth(item.month),
      actual_cost_amount_ttc: decimalToNumber(item.actual_cost_amount_ttc),
    }),
  )
  const budgetVsActualData = (budgetVsActualQuery.data ?? []).map((item) => ({
    ...item,
    selected_budget_amount_ttc: decimalToNumber(
      item.selected_budget_amount_ttc,
    ),
    actual_cost_amount_ttc: decimalToNumber(item.actual_cost_amount_ttc),
  }))
  const categoryDistributionData = (categoryDistributionQuery.data ?? []).map(
    (item, index) => ({
      ...item,
      actual_cost_amount_ttc: decimalToNumber(item.actual_cost_amount_ttc),
      fill: distributionColors[index % distributionColors.length],
    }),
  )
  const supplierDistributionData = (supplierDistributionQuery.data ?? []).map(
    (item) => ({
      ...item,
      actual_cost_amount_ttc: decimalToNumber(item.actual_cost_amount_ttc),
    }),
  )
  const topSupplierDistributionData = [...supplierDistributionData]
    .sort((a, b) => b.actual_cost_amount_ttc - a.actual_cost_amount_ttc)
    .slice(0, 10)

  function openTransaction(transactionId: number) {
    const context = transactionRowsById.get(transactionId)
    if (!context) {
      notifyError('Transaction en cours de chargement. Réessayez dans un instant.')
      return
    }
    setTransactionReview({ context, initialMode: 'view' })
  }

  function viewAllTransactions(quickView: QuickViewId) {
    void navigate(`/transactions?quick_view=${quickView}`)
  }

  function openBudgetAlert(productId: number) {
    void navigate(`/budget?product_id=${productId}`)
  }

  return (
    <section>
      <PageHeader
        title="Tableau de bord"
        description="Vue financière synthétique du projet sélectionné."
      />

      {projectsQuery.isLoading ? (
        <DashboardKpiSkeleton />
      ) : projectsQuery.isError ? (
        <DashboardMessage>
          {getApiErrorMessage(projectsQuery.error)}
        </DashboardMessage>
      ) : projectId === null ? (
        <DashboardMessage>Aucun projet actif.</DashboardMessage>
      ) : financialOverviewQuery.isLoading ? (
        <DashboardKpiSkeleton />
      ) : financialOverviewQuery.isError ? (
        <DashboardMessage>
          {getApiErrorMessage(financialOverviewQuery.error)}
        </DashboardMessage>
      ) : financialOverview ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label="Budget"
            value={formatCurrency(
              decimalToNumber(financialOverview.selected_budget_amount_ttc),
            )}
            icon={CircleDollarSign}
            tone="gold"
          />
          <KpiCard
            label="Dépenses réelles"
            value={formatCurrency(
              decimalToNumber(financialOverview.actual_cost_amount_ttc),
            )}
            icon={ReceiptText}
            tone="primary"
          />
          <KpiCard
            label="Budget restant"
            value={formatCurrency(
              decimalToNumber(financialOverview.remaining_budget_amount_ttc),
            )}
            icon={WalletCards}
            tone={variance >= 0 ? 'success' : 'destructive'}
          />
          <KpiCard
            label="Progression du budget"
            value={formatDashboardPercentage(
              financialOverview.budget_completion_percentage,
            )}
            icon={Gauge}
            tone={variance >= 0 ? 'accent' : 'warning'}
          />
        </div>
      ) : (
        <DashboardMessage>
          Aucun indicateur financier disponible pour ce projet.
        </DashboardMessage>
      )}

      {projectId !== null ? (
        <>
          <div className="mt-6 grid gap-6 xl:grid-cols-2">
            <ChartCard
              title="Dépenses dans le temps"
              description="Montants facturés par mois."
            >
              {spendingOverTimeQuery.isLoading ? (
                <DashboardChartSkeleton />
              ) : spendingOverTimeQuery.isError ? (
                <DashboardChartMessage>
                  {getApiErrorMessage(spendingOverTimeQuery.error)}
                </DashboardChartMessage>
              ) : spendingOverTimeData.length === 0 ? (
                <DashboardChartMessage>
                  Aucune dépense facturée pour ce projet.
                </DashboardChartMessage>
              ) : (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={spendingOverTimeData}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke={chartColors.border}
                      />
                      <XAxis
                        dataKey="label"
                        tick={{
                          fontSize: 12,
                          fill: chartColors.mutedForeground,
                        }}
                      />
                      <YAxis
                        tick={{
                          fontSize: 12,
                          fill: chartColors.mutedForeground,
                        }}
                        tickFormatter={(value) =>
                          `${Math.round(Number(value) / 1000)} k€`
                        }
                      />
                      <Tooltip formatter={currencyTooltip} />
                      <Line
                        type="monotone"
                        dataKey="actual_cost_amount_ttc"
                        name="Dépenses réelles"
                        stroke={chartColors.accent}
                        strokeWidth={2}
                        dot={{ r: 2, fill: chartColors.accent }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </ChartCard>

            <ChartCard
              title="Budget vs dépenses réelles"
              description="Montants agrégés par catégorie."
            >
              {budgetVsActualQuery.isLoading ? (
                <DashboardChartSkeleton />
              ) : budgetVsActualQuery.isError ? (
                <DashboardChartMessage>
                  {getApiErrorMessage(budgetVsActualQuery.error)}
                </DashboardChartMessage>
              ) : budgetVsActualData.length === 0 ? (
                <DashboardChartMessage>
                  Aucun budget par catégorie pour ce projet.
                </DashboardChartMessage>
              ) : (
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={budgetVsActualData}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke={chartColors.border}
                      />
                      <XAxis
                        dataKey="category_name"
                        tick={{
                          fontSize: 11,
                          fill: chartColors.mutedForeground,
                        }}
                        interval={0}
                        angle={-20}
                        textAnchor="end"
                        height={80}
                      />
                      <YAxis
                        tick={{
                          fontSize: 12,
                          fill: chartColors.mutedForeground,
                        }}
                        tickFormatter={(value) =>
                          `${Math.round(Number(value) / 1000)} k€`
                        }
                      />
                      <Tooltip formatter={currencyTooltip} />
                      <Legend />
                      <Bar
                        dataKey="selected_budget_amount_ttc"
                        name="Budget"
                        fill={chartColors.gold}
                        radius={[3, 3, 0, 0]}
                      />
                      <Bar
                        dataKey="actual_cost_amount_ttc"
                        name="Dépenses réelles"
                        fill={chartColors.primary}
                        radius={[3, 3, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </ChartCard>

            <ChartCard
              title="Répartition par catégorie"
              description="Dépenses réelles par catégorie."
            >
              {categoryDistributionQuery.isLoading ? (
                <DashboardChartSkeleton />
              ) : categoryDistributionQuery.isError ? (
                <DashboardChartMessage>
                  {getApiErrorMessage(categoryDistributionQuery.error)}
                </DashboardChartMessage>
              ) : categoryDistributionData.length === 0 ? (
                <DashboardChartMessage>
                  Aucune dépense à répartir par catégorie.
                </DashboardChartMessage>
              ) : (
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <Treemap
                      data={categoryDistributionData}
                      dataKey="actual_cost_amount_ttc"
                      nameKey="category_name"
                      content={CategoryTreemapNode}
                      isAnimationActive={false}
                    >
                      <Tooltip formatter={currencyTooltip} />
                    </Treemap>
                  </ResponsiveContainer>
                </div>
              )}
            </ChartCard>

            <ChartCard
              title="Répartition par fournisseur"
              description="Top 10 fournisseurs par dépenses réelles."
            >
              {supplierDistributionQuery.isLoading ? (
                <DashboardChartSkeleton />
              ) : supplierDistributionQuery.isError ? (
                <DashboardChartMessage>
                  {getApiErrorMessage(supplierDistributionQuery.error)}
                </DashboardChartMessage>
              ) : topSupplierDistributionData.length === 0 ? (
                <DashboardChartMessage>
                  Aucune dépense à répartir par fournisseur.
                </DashboardChartMessage>
              ) : (
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={topSupplierDistributionData}
                      layout="vertical"
                      margin={{ left: 24, right: 16 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke={chartColors.border}
                      />
                      <XAxis
                        type="number"
                        tick={{
                          fontSize: 12,
                          fill: chartColors.mutedForeground,
                        }}
                        tickFormatter={(value) =>
                          `${Math.round(Number(value) / 1000)} k€`
                        }
                      />
                      <YAxis
                        type="category"
                        dataKey="supplier_name"
                        width={132}
                        tick={{
                          fontSize: 12,
                          fill: chartColors.mutedForeground,
                        }}
                      />
                      <Tooltip formatter={currencyTooltip} />
                      <Bar
                        dataKey="actual_cost_amount_ttc"
                        name="Dépenses réelles"
                        radius={[0, 3, 3, 0]}
                      >
                        {topSupplierDistributionData.map((item, index) => (
                          <Cell
                            key={item.supplier_id ?? 'no-supplier'}
                            fill={
                              distributionColors[
                                index % distributionColors.length
                              ]
                            }
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </ChartCard>
          </div>

          <div className="mt-6">
            <div className="mb-4">
              <h2 className="font-heading text-xl font-semibold text-foreground">
                Centre d’action
              </h2>
            </div>
            <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
              <ActionCenterWidget
                title="Factures impayées"
                count={unpaidInvoicesQuery.data?.count ?? 0}
                onViewAll={() => viewAllTransactions('unpaid_invoices')}
              >
                <TransactionWidgetContent
                  emptyMessage="Aucune facture impayée."
                  error={unpaidInvoicesQuery.error}
                  isError={unpaidInvoicesQuery.isError}
                  isLoading={unpaidInvoicesQuery.isLoading}
                  widget={unpaidInvoicesQuery.data}
                  onItemClick={(item) => openTransaction(item.transaction_id)}
                />
              </ActionCenterWidget>

              <ActionCenterWidget
                title="Devis à négocier"
                count={quotesToNegotiateQuery.data?.count ?? 0}
                onViewAll={() => viewAllTransactions('quotes_to_negotiate')}
              >
                <TransactionWidgetContent
                  emptyMessage="Aucun devis à négocier."
                  error={quotesToNegotiateQuery.error}
                  isError={quotesToNegotiateQuery.isError}
                  isLoading={quotesToNegotiateQuery.isLoading}
                  widget={quotesToNegotiateQuery.data}
                  onItemClick={(item) => openTransaction(item.transaction_id)}
                />
              </ActionCenterWidget>

              <ActionCenterWidget
                title="Devis à confirmer"
                count={quotesToConfirmQuery.data?.count ?? 0}
                onViewAll={() => viewAllTransactions('quotes_to_confirm')}
              >
                <TransactionWidgetContent
                  emptyMessage="Aucun devis à confirmer."
                  error={quotesToConfirmQuery.error}
                  isError={quotesToConfirmQuery.isError}
                  isLoading={quotesToConfirmQuery.isLoading}
                  widget={quotesToConfirmQuery.data}
                  onItemClick={(item) => openTransaction(item.transaction_id)}
                />
              </ActionCenterWidget>

              <ActionCenterWidget
                title="Documents manquants"
                count={missingDocumentsQuery.data?.count ?? 0}
                onViewAll={() => viewAllTransactions('missing_documents')}
              >
                <TransactionWidgetContent
                  emptyMessage="Aucun document manquant."
                  error={missingDocumentsQuery.error}
                  isError={missingDocumentsQuery.isError}
                  isLoading={missingDocumentsQuery.isLoading}
                  widget={missingDocumentsQuery.data}
                  onItemClick={(item) => openTransaction(item.transaction_id)}
                />
              </ActionCenterWidget>

              <ActionCenterWidget
                title="Transactions récentes"
                count={recentTransactionsQuery.data?.count ?? 0}
                showCountBadge={false}
                onViewAll={() => void navigate('/transactions')}
              >
                <TransactionWidgetContent
                  emptyMessage="Aucune transaction récente."
                  error={recentTransactionsQuery.error}
                  isError={recentTransactionsQuery.isError}
                  isLoading={recentTransactionsQuery.isLoading}
                  widget={recentTransactionsQuery.data}
                  maxItems={5}
                  onItemClick={(item) => openTransaction(item.transaction_id)}
                />
              </ActionCenterWidget>

              <ActionCenterWidget
                title="Top 5 Écarts budgétaires"
                count={budgetAlertsQuery.data?.count ?? 0}
                showCountBadge={false}
                showActionButton={false}
              >
                <BudgetAlertsWidgetContent
                  emptyMessage="Aucun dépassement de budget."
                  error={budgetAlertsQuery.error}
                  isError={budgetAlertsQuery.isError}
                  isLoading={budgetAlertsQuery.isLoading}
                  items={budgetAlertsQuery.data?.items}
                  maxItems={5}
                  onItemClick={(item) => openBudgetAlert(item.product_id)}
                />
              </ActionCenterWidget>
            </div>
          </div>

          {transactionReview && project ? (
            <TransactionReviewModal
              project={project}
              context={transactionReview.context}
              initialMode={transactionReview.initialMode}
              suppliers={suppliers}
              isBudgetSelected={isSelectedBudgetTransaction(
                transactionReview.context.transaction,
                getBudgetSelection(transactionReview),
              )}
              canToggleBudgetSelection={canToggleBudgetSelection(
                transactionReview.context.transaction,
              )}
              onToggleBudgetSelection={() => undefined}
              onClose={() => setTransactionReview(null)}
            />
          ) : null}
        </>
      ) : null}
    </section>
  )
}
