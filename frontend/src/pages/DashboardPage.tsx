import { CircleDollarSign, Gauge, ReceiptText, WalletCards } from 'lucide-react'

import { getApiErrorMessage } from '@/api/client'
import {
  useProjectDashboardFinancialOverviewQuery,
  useProjectsQuery,
} from '@/api/projects'
import { KpiCard } from '@/components/shared/KpiCard'
import { PageHeader } from '@/components/shared/PageHeader'
import type { ApiDecimal } from '@/api/types'
import { formatCurrency } from '@/lib/format'
import { useAppState } from '@/state/appState'

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
  const financialOverview = financialOverviewQuery.data
  const variance = decimalToNumber(
    financialOverview?.selected_budget_variance_ttc,
  )

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
    </section>
  )
}
