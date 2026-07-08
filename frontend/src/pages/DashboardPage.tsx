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
  useProjectDashboardBudgetVsActualQuery,
  useProjectDashboardCategoryDistributionQuery,
  useProjectDashboardFinancialOverviewQuery,
  useProjectDashboardSpendingOverTimeQuery,
  useProjectDashboardSupplierDistributionQuery,
  useProjectsQuery,
} from '@/api/projects'
import { ChartCard } from '@/components/shared/ChartCard'
import { KpiCard } from '@/components/shared/KpiCard'
import { PageHeader } from '@/components/shared/PageHeader'
import type { ApiDecimal } from '@/api/types'
import { formatCurrency, formatMonth } from '@/lib/format'
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
  const budgetVsActualQuery = useProjectDashboardBudgetVsActualQuery(projectId, {
    enabled: true,
  })
  const categoryDistributionQuery =
    useProjectDashboardCategoryDistributionQuery(projectId, { enabled: true })
  const supplierDistributionQuery =
    useProjectDashboardSupplierDistributionQuery(projectId, { enabled: true })
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
  const categoryDistributionData = (
    categoryDistributionQuery.data ?? []
  ).map((item, index) => ({
    ...item,
    actual_cost_amount_ttc: decimalToNumber(item.actual_cost_amount_ttc),
    fill: distributionColors[index % distributionColors.length],
  }))
  const supplierDistributionData = (
    supplierDistributionQuery.data ?? []
  ).map((item) => ({
    ...item,
    actual_cost_amount_ttc: decimalToNumber(item.actual_cost_amount_ttc),
  }))
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
      ) : null}
    </section>
  )
}
