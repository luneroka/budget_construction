import type { ReactNode } from 'react'

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
import { ChartCard } from '@/components/shared/ChartCard'
import { KpiCard } from '@/components/shared/KpiCard'
import { PageHeader } from '@/components/shared/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type {
  ApiDecimal,
  DashboardBudgetAlertRead,
  DashboardTransactionWidgetItemRead,
  DashboardTransactionWidgetRead,
} from '@/api/types'
import { formatCurrency, formatDate, formatMonth } from '@/lib/format'
import { useAppState } from '@/state/appState'

const chartColors = {
  primary: 'hsl(var(--primary))',
  accent: 'hsl(var(--accent))',
  gold: 'hsl(var(--gold))',
  success: 'hsl(var(--success))',
  warning: 'hsl(var(--warning))',
  destructive: 'hsl(var(--destructive))',
  border: 'hsl(var(--border))',
  mutedForeground: 'hsl(var(--muted-foreground))',
}

const distributionColors = [
  chartColors.primary,
  chartColors.accent,
  chartColors.gold,
  chartColors.success,
  chartColors.warning,
  chartColors.destructive,
]

function decimalToNumber(
  value: ApiDecimal | number | null | undefined,
): number {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function formatDashboardPercentage(value: ApiDecimal): string {
  return `${new Intl.NumberFormat('fr-FR', {
    maximumFractionDigits: 1,
  }).format(decimalToNumber(value))} %`
}

function DashboardKpiSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={index}
          className="rounded-lg border border-border bg-card p-5"
        >
          <div className="flex items-center justify-between gap-4">
            <div className="h-3 w-28 animate-pulse rounded bg-muted" />
            <div className="h-4 w-4 animate-pulse rounded bg-muted" />
          </div>
          <div className="mt-3 h-8 w-32 animate-pulse rounded bg-muted" />
          <div className="mt-3 h-4 w-24 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  )
}

function DashboardMessage({ children }: { children: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-card p-6 text-sm text-muted-foreground">
      {children}
    </div>
  )
}

function DashboardChartSkeleton() {
  return <div className="h-72 animate-pulse rounded-md bg-muted" />
}

function DashboardChartMessage({ children }: { children: string }) {
  return (
    <div className="flex h-72 items-center justify-center rounded-md border border-dashed border-border text-sm text-muted-foreground">
      {children}
    </div>
  )
}

function DashboardWidgetSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="h-12 animate-pulse rounded-md bg-muted" />
      ))}
    </div>
  )
}

function DashboardWidgetMessage({ children }: { children: string }) {
  return (
    <div className="flex min-h-36 items-center justify-center rounded-md border border-dashed border-border px-4 text-center text-sm text-muted-foreground">
      {children}
    </div>
  )
}

function currencyTooltip(value: unknown) {
  return formatCurrency(decimalToNumber(value as ApiDecimal | number))
}

type TreemapNodeProps = {
  x?: number
  y?: number
  width?: number
  height?: number
  category_name?: string
  fill?: string
}

function CategoryTreemapNode(props: unknown) {
  const {
    x = 0,
    y = 0,
    width = 0,
    height = 0,
    category_name: categoryName = '',
    fill = chartColors.primary,
  } = props as TreemapNodeProps
  const canShowLabel = width >= 90 && height >= 36

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={fill}
        stroke="hsl(var(--card))"
        strokeWidth={2}
      />
      {canShowLabel ? (
        <text
          x={x + 10}
          y={y + 22}
          fill="hsl(var(--primary-foreground))"
          fontSize={12}
          fontWeight={600}
        >
          {categoryName}
        </text>
      ) : null}
    </g>
  )
}

function ActionCenterWidget({
  children,
  count,
  title,
}: {
  children: ReactNode
  count: number
  title: string
}) {
  return (
    <ChartCard
      title={title}
      action={
        <div className="flex items-center gap-2">
          <Badge variant={count > 0 ? 'default' : 'muted'}>{count}</Badge>
          <Button size="sm" variant="outline" disabled>
            Voir tout
          </Button>
        </div>
      }
    >
      {children}
    </ChartCard>
  )
}

function transactionItemTitle(item: DashboardTransactionWidgetItemRead) {
  return item.description?.trim() || item.budget_line_name || item.product_name
}

function TransactionWidgetContent({
  emptyMessage,
  error,
  isError,
  isLoading,
  widget,
}: {
  emptyMessage: string
  error: unknown
  isError: boolean
  isLoading: boolean
  widget?: DashboardTransactionWidgetRead
}) {
  if (isLoading) return <DashboardWidgetSkeleton />
  if (isError) {
    return (
      <DashboardWidgetMessage>
        {getApiErrorMessage(error)}
      </DashboardWidgetMessage>
    )
  }
  if (!widget || widget.items.length === 0) {
    return <DashboardWidgetMessage>{emptyMessage}</DashboardWidgetMessage>
  }

  return (
    <div className="divide-y divide-border">
      {widget.items.map((item) => (
        <div
          key={item.transaction_id}
          className="grid grid-cols-[1fr_auto] gap-3 py-3 first:pt-0 last:pb-0"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">
              {transactionItemTitle(item)}
            </p>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {item.supplier_name ?? 'Autoconstruction'} · {item.category_name}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold text-foreground">
              {formatCurrency(decimalToNumber(item.amount_ttc))}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {formatDate(item.issued_date)}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}

function BudgetAlertsWidgetContent({
  emptyMessage,
  error,
  isError,
  isLoading,
  items,
}: {
  emptyMessage: string
  error: unknown
  isError: boolean
  isLoading: boolean
  items?: DashboardBudgetAlertRead[]
}) {
  if (isLoading) return <DashboardWidgetSkeleton />
  if (isError) {
    return (
      <DashboardWidgetMessage>
        {getApiErrorMessage(error)}
      </DashboardWidgetMessage>
    )
  }
  if (!items || items.length === 0) {
    return <DashboardWidgetMessage>{emptyMessage}</DashboardWidgetMessage>
  }

  return (
    <div className="divide-y divide-border">
      {items.map((item) => (
        <div
          key={item.product_id}
          className="grid grid-cols-[1fr_auto] gap-3 py-3 first:pt-0 last:pb-0"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">
              {item.product_name}
            </p>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {item.category_name}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold text-destructive">
              {formatCurrency(decimalToNumber(item.variance_ttc))}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {formatCurrency(decimalToNumber(item.actual_cost_amount_ttc))}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}

export function DashboardPage() {
  const { selectedProjectId } = useAppState()
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
              >
                <TransactionWidgetContent
                  emptyMessage="Aucune facture impayée."
                  error={unpaidInvoicesQuery.error}
                  isError={unpaidInvoicesQuery.isError}
                  isLoading={unpaidInvoicesQuery.isLoading}
                  widget={unpaidInvoicesQuery.data}
                />
              </ActionCenterWidget>

              <ActionCenterWidget
                title="Devis à confirmer"
                count={quotesToConfirmQuery.data?.count ?? 0}
              >
                <TransactionWidgetContent
                  emptyMessage="Aucun devis à confirmer."
                  error={quotesToConfirmQuery.error}
                  isError={quotesToConfirmQuery.isError}
                  isLoading={quotesToConfirmQuery.isLoading}
                  widget={quotesToConfirmQuery.data}
                />
              </ActionCenterWidget>

              <ActionCenterWidget
                title="Devis à négocier"
                count={quotesToNegotiateQuery.data?.count ?? 0}
              >
                <TransactionWidgetContent
                  emptyMessage="Aucun devis à négocier."
                  error={quotesToNegotiateQuery.error}
                  isError={quotesToNegotiateQuery.isError}
                  isLoading={quotesToNegotiateQuery.isLoading}
                  widget={quotesToNegotiateQuery.data}
                />
              </ActionCenterWidget>

              <ActionCenterWidget
                title="Documents manquants"
                count={missingDocumentsQuery.data?.count ?? 0}
              >
                <TransactionWidgetContent
                  emptyMessage="Aucun document manquant."
                  error={missingDocumentsQuery.error}
                  isError={missingDocumentsQuery.isError}
                  isLoading={missingDocumentsQuery.isLoading}
                  widget={missingDocumentsQuery.data}
                />
              </ActionCenterWidget>

              <ActionCenterWidget
                title="Transactions récentes"
                count={recentTransactionsQuery.data?.count ?? 0}
              >
                <TransactionWidgetContent
                  emptyMessage="Aucune transaction récente."
                  error={recentTransactionsQuery.error}
                  isError={recentTransactionsQuery.isError}
                  isLoading={recentTransactionsQuery.isLoading}
                  widget={recentTransactionsQuery.data}
                />
              </ActionCenterWidget>

              <ActionCenterWidget
                title="Alertes budget"
                count={budgetAlertsQuery.data?.count ?? 0}
              >
                <BudgetAlertsWidgetContent
                  emptyMessage="Aucun dépassement de budget."
                  error={budgetAlertsQuery.error}
                  isError={budgetAlertsQuery.isError}
                  isLoading={budgetAlertsQuery.isLoading}
                  items={budgetAlertsQuery.data?.items}
                />
              </ActionCenterWidget>
            </div>
          </div>
        </>
      ) : null}
    </section>
  )
}
