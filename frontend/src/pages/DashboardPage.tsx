import { CircleDollarSign, FileClock, ReceiptText } from 'lucide-react'

import { ChartCard } from '@/components/shared/ChartCard'
import { KpiCard } from '@/components/shared/KpiCard'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatusBadge } from '@/components/shared/StatusBadge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { dashboardViewModel } from '@/demo/demo-data'
import { formatCurrency } from '@/lib/format'

export function DashboardPage() {
  const { financialSummary, recentTransactions } = dashboardViewModel

  return (
    <section>
      <PageHeader
        eyebrow="Vue projet"
        title="Tableau de bord"
        description={`Apercu financier pour ${dashboardViewModel.project.name}. Donnees derivees des seeds backend.`}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <KpiCard
          label="Budget selectionne"
          value={formatCurrency(financialSummary.selected_budget_amount_ttc)}
          detail="selected_budget_amount_ttc"
          icon={CircleDollarSign}
          tone="gold"
        />
        <KpiCard
          label="Cout facture"
          value={formatCurrency(financialSummary.actual_cost_amount_ttc)}
          detail="actual_cost_amount_ttc"
          icon={ReceiptText}
          tone="primary"
        />
        <KpiCard
          label="Factures a payer"
          value={formatCurrency(financialSummary.unpaid_invoice_amount_ttc)}
          detail="invoice_status = unpaid"
          icon={FileClock}
          tone="warning"
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <ChartCard
          title="Budget vs facture"
          description="Placeholder visuel avant integration des series."
        >
          <div className="flex h-52 items-center justify-center rounded-md bg-muted text-sm text-muted-foreground">
            Graphique a venir
          </div>
        </ChartCard>

        <ChartCard title="Transactions recentes">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="text-right">Montant</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentTransactions.slice(0, 4).map((transaction) => (
                <TableRow key={transaction.id}>
                  <TableCell className="font-medium">
                    {transaction.description}
                  </TableCell>
                  <TableCell>
                    <StatusBadge
                      status={
                        transaction.quote_status ??
                        transaction.invoice_status ??
                        transaction.transaction_type
                      }
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(transaction.amount_ttc)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ChartCard>
      </div>
    </section>
  )
}
