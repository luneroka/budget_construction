import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CircleCheck,
  CircleDollarSign,
  ReceiptText,
  WalletCards,
} from 'lucide-react'
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
  XAxis,
  YAxis,
} from 'recharts'

import { getApiErrorMessage } from '@/api/client'
import { useProjectLotsQuery } from '@/api/lots'
import {
  useProjectDashboardFinancialOverviewQuery,
  useProjectDashboardInvoicedByLotQuery,
  useProjectDashboardMissingDocumentsQuery,
  useProjectDashboardQuotesToFollowUpQuery,
  useProjectDashboardSpendingOverTimeQuery,
  useProjectDashboardSupplierDistributionQuery,
  useProjectDashboardSupplierDocumentsQuery,
  useProjectDashboardUnpaidInvoicesQuery,
  useProjectsQuery,
} from '@/api/projects'
import { useSuppliersQuery } from '@/api/suppliers'
import { useProjectTransactionsQuery } from '@/api/transactions'
import type {
  TransactionAction,
  TransactionReviewState,
} from '@/components/budget/types'
import {
  TransactionModal,
  TransactionReviewModal,
} from '@/components/budget/TransactionModal'
import { invoicePrefillFromQuote } from '@/components/budget/transaction-form/transactionForm'
import { ChartCard } from '@/components/shared/ChartCard'
import { KpiCard } from '@/components/shared/KpiCard'
import { PageHeader } from '@/components/shared/PageHeader'
import {
  ActionCenterWidget,
  SupplierDocumentsWidgetContent,
  TransactionWidgetContent,
} from '@/components/dashboard/ActionCenter'
import {
  DashboardChartSkeleton,
  DashboardKpiSkeleton,
} from '@/components/dashboard/Skeletons'
import {
  DashboardChartMessage,
  DashboardLoadError,
  DashboardMessage,
} from '@/components/dashboard/Messages'
import {
  chartColors,
  currencyTooltip,
  getPrimaryGradientColor,
} from '@/components/dashboard/utils'
import { formatCurrency, formatMonth } from '@/lib/format'
import {
  decimalToNumber,
  projectToDomain,
  suppliersToDomain,
} from '@/lib/apiAdapters'
import { QUOTES_AND_INVOICES_PATH } from '@/lib/legacyRoutes'
import { visibleLots } from '@/lib/lots'
import { documentsToRenew } from '@/lib/supplierDocuments'
import {
  buildTransactionRow,
  lotLabel,
  type QuickViewId,
} from '@/lib/transactionWorkspace'
import type { Transaction } from '@/types'
import { notifyError } from '@/lib/toasts'
import { cn } from '@/lib/utils'
import { useSelectedProjectId } from '@/state/appState'

// What an empty invoice chart says, and what a chart that failed to load says.
const NO_INVOICE_MESSAGE = 'Aucune facture enregistrée pour ce projet.'
const CHART_LOAD_ERROR = 'Impossible de charger ce graphique.'

const kiloEuroTick = (value: unknown) =>
  `${Math.round(Number(value) / 1000)} k€`

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
  const projectId = useSelectedProjectId()
  const navigate = useNavigate()
  const projectsQuery = useProjectsQuery()
  const financialOverviewQuery = useProjectDashboardFinancialOverviewQuery(
    projectId,
    { enabled: true },
  )
  const spendingOverTimeQuery = useProjectDashboardSpendingOverTimeQuery(
    projectId,
    { enabled: true },
  )
  const invoicedByLotQuery = useProjectDashboardInvoicedByLotQuery(projectId)
  const supplierDistributionQuery =
    useProjectDashboardSupplierDistributionQuery(projectId)
  const unpaidInvoicesQuery = useProjectDashboardUnpaidInvoicesQuery(
    projectId,
    { enabled: includeActionCenter },
  )
  const quotesToFollowUpQuery = useProjectDashboardQuotesToFollowUpQuery(
    projectId,
    { enabled: includeActionCenter },
  )
  const missingDocumentsQuery = useProjectDashboardMissingDocumentsQuery(
    projectId,
    { enabled: includeActionCenter },
  )
  const supplierDocumentsQuery = useProjectDashboardSupplierDocumentsQuery(
    projectId,
    { enabled: includeActionCenter },
  )
  const transactionsQuery = useProjectTransactionsQuery(projectId, {
    enabled: false,
  })
  const [transactionReview, setTransactionReview] =
    useState<TransactionReviewState | null>(null)
  const [activeAction, setActiveAction] = useState<TransactionAction | null>(
    null,
  )
  const isEditingTransaction =
    transactionReview !== null || activeAction !== null
  const suppliersQuery = useSuppliersQuery({
    enabled: projectId !== null && isEditingTransaction,
  })
  const lotsQuery = useProjectLotsQuery(projectId, {
    enabled: isEditingTransaction,
  })
  const pickableLots = useMemo(
    () => visibleLots(lotsQuery.data),
    [lotsQuery.data],
  )
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
  const overviewFigures = {
    plannedTtc: decimalToNumber(financialOverview?.planned_cost_ttc),
    invoicedTtc: decimalToNumber(financialOverview?.invoiced_amount_ttc),
    paidTtc: decimalToNumber(financialOverview?.paid_invoice_amount_ttc),
    toPayTtc: decimalToNumber(financialOverview?.to_pay_amount_ttc),
  }
  const spendingOverTimeData = useMemo(
    () =>
      (spendingOverTimeQuery.data ?? []).map((item) => ({
        ...item,
        label: formatMonth(item.month),
        invoiced_amount_ttc: decimalToNumber(item.invoiced_amount_ttc),
      })),
    [spendingOverTimeQuery.data],
  )
  // The API lists only the lots with something invoiced.
  const invoicedByLotData = useMemo(
    () =>
      (invoicedByLotQuery.data ?? []).map((item) => ({
        ...item,
        lot_label: lotLabel({
          code: item.lot_code,
          designation: item.lot_designation,
        }),
        paid_invoice_amount_ttc: decimalToNumber(item.paid_invoice_amount_ttc),
        to_pay_amount_ttc: decimalToNumber(item.to_pay_amount_ttc),
      })),
    [invoicedByLotQuery.data],
  )
  const supplierDocumentsToRenew = useMemo(
    () => documentsToRenew(supplierDocumentsQuery.data ?? []),
    [supplierDocumentsQuery.data],
  )
  const topSupplierDistributionData = useMemo(
    () =>
      (supplierDistributionQuery.data ?? [])
        .map((item) => ({
          ...item,
          invoiced_amount_ttc: decimalToNumber(item.invoiced_amount_ttc),
        }))
        .sort((a, b) => b.invoiced_amount_ttc - a.invoiced_amount_ttc)
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
        !invoicedByLotQuery.isLoading &&
        !invoicedByLotQuery.isFetching &&
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
    setTransactionReview({ context })
  }

  function viewAllTransactions(quickView: QuickViewId) {
    void navigate(`${QUOTES_AND_INVOICES_PATH}?quick_view=${quickView}`)
  }

  // A bar of « Facturé par lot » opens its lot.
  function openLot(data: unknown) {
    const lotId = (data as { payload?: { lot_id?: number } }).payload?.lot_id
    if (lotId !== undefined) void navigate(`/lots/${lotId}`)
  }

  function addInvoiceForQuote(quote: Transaction) {
    setTransactionReview(null)
    setActiveAction({
      lotId: quote.lot_id,
      transactionType: 'invoice',
      prefill: invoicePrefillFromQuote(quote),
    })
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
      ) : financialOverviewQuery.isError || !financialOverview ? (
        <DashboardLoadError
          size="block"
          message="Impossible de charger les indicateurs du projet."
          onRetry={() => void financialOverviewQuery.refetch()}
        />
      ) : (
        <div
          className={cn(
            'grid gap-4',
            exportLayout ? 'grid-cols-4' : 'sm:grid-cols-2 xl:grid-cols-4',
          )}
        >
          <KpiCard
            label="Coût prévu"
            value={formatCurrency(overviewFigures.plannedTtc)}
            icon={CircleDollarSign}
            tone="accent"
          />
          <KpiCard
            label="Facturé"
            value={formatCurrency(overviewFigures.invoicedTtc)}
            icon={ReceiptText}
            tone="primary"
          />
          <KpiCard
            label="Payé"
            value={formatCurrency(overviewFigures.paidTtc)}
            icon={CircleCheck}
            tone="success"
          />
          <KpiCard
            label="À payer"
            value={formatCurrency(overviewFigures.toPayTtc)}
            icon={WalletCards}
            tone="gold"
          />
        </div>
      )}

      {projectId !== null ? (
        <>
          <div
            className={cn(
              'mt-6 grid gap-6',
              exportLayout ? 'grid-cols-2' : 'xl:grid-cols-2',
            )}
          >
            <div className={exportLayout ? 'col-span-2' : 'xl:col-span-2'}>
              <ChartCard
                title="Facturé par lot"
                description="Payé et à payer, pour les lots facturés."
              >
                {invoicedByLotQuery.isLoading ? (
                  <DashboardChartSkeleton />
                ) : invoicedByLotQuery.isError ? (
                  <DashboardLoadError
                    message={CHART_LOAD_ERROR}
                    onRetry={() => void invoicedByLotQuery.refetch()}
                  />
                ) : invoicedByLotData.length === 0 ? (
                  <DashboardChartMessage>
                    {NO_INVOICE_MESSAGE}
                  </DashboardChartMessage>
                ) : (
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={invoicedByLotData}>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke={chartColors.border}
                        />
                        <XAxis
                          dataKey="lot_code"
                          tick={{
                            fontSize: 11,
                            fill: chartColors.mutedForeground,
                          }}
                          interval={0}
                        />
                        <YAxis
                          tick={{
                            fontSize: 12,
                            fill: chartColors.mutedForeground,
                          }}
                          tickFormatter={kiloEuroTick}
                        />
                        <Tooltip
                          formatter={currencyTooltip}
                          labelFormatter={(_label, payload) =>
                            (
                              payload?.[0]?.payload as
                                { lot_label?: string } | undefined
                            )?.lot_label ?? ''
                          }
                        />
                        <Legend />
                        <Bar
                          dataKey="paid_invoice_amount_ttc"
                          name="Payé"
                          stackId="invoiced"
                          fill={chartColors.success}
                          className="cursor-pointer"
                          onClick={(data) => openLot(data)}
                        />
                        <Bar
                          dataKey="to_pay_amount_ttc"
                          name="À payer"
                          stackId="invoiced"
                          fill={chartColors.gold}
                          radius={[3, 3, 0, 0]}
                          className="cursor-pointer"
                          onClick={(data) => openLot(data)}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </ChartCard>
            </div>

            <ChartCard
              title="Dépenses dans le temps"
              description="Montants facturés par mois, payés ou non."
            >
              {spendingOverTimeQuery.isLoading ? (
                <DashboardChartSkeleton />
              ) : spendingOverTimeQuery.isError ? (
                <DashboardLoadError
                  message={CHART_LOAD_ERROR}
                  onRetry={() => void spendingOverTimeQuery.refetch()}
                />
              ) : spendingOverTimeData.length === 0 ? (
                <DashboardChartMessage>
                  {NO_INVOICE_MESSAGE}
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
                        tickFormatter={kiloEuroTick}
                      />
                      <Tooltip formatter={currencyTooltip} />
                      <Line
                        type="monotone"
                        dataKey="invoiced_amount_ttc"
                        name="Facturé"
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
              title="Répartition par fournisseur"
              description="Top 10 fournisseurs par montant facturé."
            >
              {supplierDistributionQuery.isLoading ? (
                <DashboardChartSkeleton />
              ) : supplierDistributionQuery.isError ? (
                <DashboardLoadError
                  message={CHART_LOAD_ERROR}
                  onRetry={() => void supplierDistributionQuery.refetch()}
                />
              ) : topSupplierDistributionData.length === 0 ? (
                <DashboardChartMessage>
                  {NO_INVOICE_MESSAGE}
                </DashboardChartMessage>
              ) : (
                <div className="h-72">
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
                        tickFormatter={kiloEuroTick}
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
                        dataKey="invoiced_amount_ttc"
                        name="Facturé"
                        radius={[0, 3, 3, 0]}
                        onClick={(data) => {
                          const supplierId = (
                            data as {
                              payload?: { supplier_id?: number | null }
                            }
                          ).payload?.supplier_id
                          if (supplierId == null) return
                          navigate(`/suppliers/${supplierId}`)
                        }}
                      >
                        {topSupplierDistributionData.map((item, index) => (
                          <Cell
                            key={item.supplier_id ?? 'no-supplier'}
                            className={
                              item.supplier_id === null
                                ? undefined
                                : 'cursor-pointer'
                            }
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
                <h2 className="font-[family-name:var(--font-body)] text-xl font-semibold text-foreground">
                  Centre d’action
                </h2>
              </div>
              <div className="grid gap-6 lg:grid-cols-2">
                <ActionCenterWidget
                  title="Factures impayées"
                  count={unpaidInvoicesQuery.data?.count ?? 0}
                  onViewAll={() => viewAllTransactions('unpaid_invoices')}
                >
                  <TransactionWidgetContent
                    emptyMessage="Aucune facture impayée."
                    isError={unpaidInvoicesQuery.isError}
                    isLoading={unpaidInvoicesQuery.isLoading}
                    widget={unpaidInvoicesQuery.data}
                    onItemClick={(item) =>
                      void openTransaction(item.transaction_id)
                    }
                    onRetry={() => void unpaidInvoicesQuery.refetch()}
                  />
                </ActionCenterWidget>

                {/* No « Voir tout »: the « Devis et factures » page has a
                    quick view for each status, none for both. */}
                <ActionCenterWidget
                  title="Devis à confirmer ou à négocier"
                  count={quotesToFollowUpQuery.data?.count ?? 0}
                  showActionButton={false}
                >
                  <TransactionWidgetContent
                    emptyMessage="Aucun devis à confirmer ou à négocier."
                    isError={quotesToFollowUpQuery.isError}
                    isLoading={quotesToFollowUpQuery.isLoading}
                    widget={quotesToFollowUpQuery.data}
                    onItemClick={(item) =>
                      void openTransaction(item.transaction_id)
                    }
                    onRetry={() => void quotesToFollowUpQuery.refetch()}
                  />
                </ActionCenterWidget>

                <ActionCenterWidget
                  title="Documents manquants"
                  count={missingDocumentsQuery.data?.count ?? 0}
                  onViewAll={() => viewAllTransactions('missing_documents')}
                >
                  <TransactionWidgetContent
                    emptyMessage="Aucun document manquant."
                    isError={missingDocumentsQuery.isError}
                    isLoading={missingDocumentsQuery.isLoading}
                    widget={missingDocumentsQuery.data}
                    onItemClick={(item) =>
                      void openTransaction(item.transaction_id)
                    }
                    onRetry={() => void missingDocumentsQuery.refetch()}
                  />
                </ActionCenterWidget>

                <ActionCenterWidget
                  title="Documents fournisseurs à renouveler"
                  count={supplierDocumentsToRenew.length}
                  showActionButton={false}
                >
                  <SupplierDocumentsWidgetContent
                    documents={supplierDocumentsToRenew}
                    isError={supplierDocumentsQuery.isError}
                    isLoading={supplierDocumentsQuery.isLoading}
                    onRetry={() => void supplierDocumentsQuery.refetch()}
                  />
                </ActionCenterWidget>
              </div>
            </div>
          ) : null}

          {includeActionCenter && transactionReview && project ? (
            <TransactionReviewModal
              project={project}
              context={transactionReview.context}
              lots={pickableLots}
              suppliers={suppliers}
              onAddInvoiceForQuote={addInvoiceForQuote}
              onClose={() => setTransactionReview(null)}
            />
          ) : null}

          {includeActionCenter && activeAction && project ? (
            <TransactionModal
              project={project}
              lots={pickableLots}
              initialLotId={activeAction.lotId}
              initialType={activeAction.transactionType}
              prefill={activeAction.prefill}
              suppliers={suppliers}
              onClose={() => setActiveAction(null)}
            />
          ) : null}
        </>
      ) : null}
    </section>
  )
}
