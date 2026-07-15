import { useEffect, useMemo, useState } from 'react'
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
  useProjectDashboardBudgetToValidateQuery,
  useProjectDashboardBudgetVsActualQuery,
  useProjectDashboardCategoryDistributionQuery,
  useProjectDashboardFinancialOverviewQuery,
  useProjectDashboardMissingDocumentsQuery,
  useProjectDashboardQuotesToConfirmQuery,
  useProjectDashboardQuotesToNegotiateQuery,
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
  getPrimaryGradientColor,
} from '@/components/dashboard/utils'
import { formatCurrency, formatMonth } from '@/lib/format'
import { suppliersToDomain } from '@/lib/budgetWorkspaceApiAdapter'
import { canToggleBudgetSelection } from '@/lib/budgetDomain'
import {
  buildTransactionRow,
  type QuickViewId,
} from '@/lib/transactionWorkspace'
import { notifyError } from '@/lib/toasts'
import { cn } from '@/lib/utils'
import { useAppState } from '@/state/appState'
import type { Project } from '@/types'

function projectToDomain(project: ProjectRead): Project {
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

type DashboardPageProps = {
  includeActionCenter?: boolean
  exportLayout?: boolean
  onExportReadyChange?: (isReady: boolean) => void
}

export function DashboardPage({
  includeActionCenter = true,
  exportLayout = false,
  onExportReadyChange,
}: DashboardPageProps = {}) {
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
      enabled: includeActionCenter,
    },
  )
  const quotesToConfirmQuery = useProjectDashboardQuotesToConfirmQuery(
    projectId,
    { enabled: includeActionCenter },
  )
  const quotesToNegotiateQuery = useProjectDashboardQuotesToNegotiateQuery(
    projectId,
    { enabled: includeActionCenter },
  )
  const missingDocumentsQuery = useProjectDashboardMissingDocumentsQuery(
    projectId,
    { enabled: includeActionCenter },
  )
  const budgetToValidateQuery = useProjectDashboardBudgetToValidateQuery(
    projectId,
    { enabled: includeActionCenter },
  )
  const budgetAlertsQuery = useProjectDashboardBudgetAlertsQuery(projectId, {
    enabled: includeActionCenter,
  })
  const transactionsQuery = useProjectTransactionsQuery(projectId, {
    enabled: false,
  })
  const [transactionReview, setTransactionReview] =
    useState<TransactionReviewState | null>(null)
  const suppliersQuery = useSuppliersQuery({
    enabled: projectId !== null && transactionReview !== null,
  })
  const project = useMemo(() => {
    const selectedProject = projectsQuery.data?.find(
      (candidate) => candidate.id === projectId,
    )
    return selectedProject ? projectToDomain(selectedProject) : null
  }, [projectId, projectsQuery.data])
  const dashboardDescription = project?.location
    ? `Vue financière synthétique du projet ${project.name} à ${project.location}.`
    : project
      ? `Vue financière synthétique du projet ${project.name}.`
      : 'Vue financière synthétique du projet sélectionné.'
  const suppliers = useMemo(
    () => suppliersToDomain(suppliersQuery.data),
    [suppliersQuery.data],
  )
  const financialOverview = financialOverviewQuery.data
  const variance = decimalToNumber(
    financialOverview?.selected_budget_variance_ttc,
  )
  const spendingOverTimeData = useMemo(
    () =>
      (spendingOverTimeQuery.data ?? []).map((item) => ({
        ...item,
        label: formatMonth(item.month),
        actual_cost_amount_ttc: decimalToNumber(item.actual_cost_amount_ttc),
      })),
    [spendingOverTimeQuery.data],
  )
  const budgetVsActualData = useMemo(
    () =>
      (budgetVsActualQuery.data ?? []).map((item) => ({
        ...item,
        selected_budget_amount_ttc: decimalToNumber(
          item.selected_budget_amount_ttc,
        ),
        actual_cost_amount_ttc: decimalToNumber(item.actual_cost_amount_ttc),
      })),
    [budgetVsActualQuery.data],
  )
  const categoryDistributionData = useMemo(
    () =>
      (categoryDistributionQuery.data ?? []).map((item, index) => ({
        ...item,
        actual_cost_amount_ttc: decimalToNumber(item.actual_cost_amount_ttc),
        fill: distributionColors[index % distributionColors.length],
      })),
    [categoryDistributionQuery.data],
  )
  const topSupplierDistributionData = useMemo(
    () =>
      (supplierDistributionQuery.data ?? [])
        .map((item) => ({
          ...item,
          actual_cost_amount_ttc: decimalToNumber(item.actual_cost_amount_ttc),
        }))
        .sort((a, b) => b.actual_cost_amount_ttc - a.actual_cost_amount_ttc)
        .slice(0, 10),
    [supplierDistributionQuery.data],
  )
  const dashboardExportReady =
    !projectsQuery.isLoading &&
    !projectsQuery.isFetching &&
    (projectId === null ||
      (!financialOverviewQuery.isLoading &&
        !financialOverviewQuery.isFetching &&
        !spendingOverTimeQuery.isLoading &&
        !spendingOverTimeQuery.isFetching &&
        !budgetVsActualQuery.isLoading &&
        !budgetVsActualQuery.isFetching &&
        !categoryDistributionQuery.isLoading &&
        !categoryDistributionQuery.isFetching &&
        !supplierDistributionQuery.isLoading &&
        !supplierDistributionQuery.isFetching))

  useEffect(() => {
    onExportReadyChange?.(dashboardExportReady)
  }, [dashboardExportReady, onExportReadyChange])

  async function openTransaction(transactionId: number) {
    const result = await transactionsQuery.refetch()
    if (result.error) {
      notifyError(
        `Impossible d’ouvrir la transaction. ${getApiErrorMessage(
          result.error,
        )}`,
      )
      return
    }

    const transaction = result.data?.find(
      (candidate) => candidate.id === transactionId,
    )
    const context = transaction ? buildTransactionRow(transaction) : null
    if (!context) {
      notifyError('Transaction introuvable dans le projet sélectionné.')
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
      <PageHeader title="Tableau de bord" description={dashboardDescription} />

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
        <div
          className={cn(
            'grid gap-4',
            exportLayout ? 'grid-cols-4' : 'sm:grid-cols-2 xl:grid-cols-4',
          )}
        >
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
          <div
            className={cn(
              'mt-6 grid gap-6',
              exportLayout ? 'grid-cols-2' : 'xl:grid-cols-2',
            )}
          >
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
                            fill={getPrimaryGradientColor(
                              index,
                              topSupplierDistributionData.length,
                            )}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </ChartCard>
          </div>

          {includeActionCenter ? (
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
                    onItemClick={(item) =>
                      void openTransaction(item.transaction_id)
                    }
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
                    onItemClick={(item) =>
                      void openTransaction(item.transaction_id)
                    }
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
                    onItemClick={(item) =>
                      void openTransaction(item.transaction_id)
                    }
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
                    onItemClick={(item) =>
                      void openTransaction(item.transaction_id)
                    }
                  />
                </ActionCenterWidget>

                <ActionCenterWidget
                  title="Budget à valider"
                  count={budgetToValidateQuery.data?.count ?? 0}
                  onViewAll={() => viewAllTransactions('budget_to_validate')}
                >
                  <TransactionWidgetContent
                    emptyMessage="Aucun budget à valider."
                    error={budgetToValidateQuery.error}
                    isError={budgetToValidateQuery.isError}
                    isLoading={budgetToValidateQuery.isLoading}
                    widget={budgetToValidateQuery.data}
                    onItemClick={(item) =>
                      void openTransaction(item.transaction_id)
                    }
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
          ) : null}

          {includeActionCenter && transactionReview && project ? (
            <TransactionReviewModal
              project={project}
              context={transactionReview.context}
              initialMode={transactionReview.initialMode}
              suppliers={suppliers}
              isBudgetSelected={
                transactionReview.context.transaction.select_as_budget
              }
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
