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

export function DashboardPage() {
  return (
    <section>
      <PageHeader
        eyebrow="Vue projet"
        title="Tableau de bord"
        description="Apercu financier du projet selectionne. Les indicateurs detailles seront branches sur les donnees de synthese dans les prochains chunks."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <KpiCard
          label="Budget selectionne"
          value="245 000 €"
          detail="Montant provisoire de demonstration"
          icon={CircleDollarSign}
          tone="gold"
        />
        <KpiCard
          label="Cout facture"
          value="118 400 €"
          detail="Factures rattachees aux lignes budget"
          icon={ReceiptText}
          tone="primary"
        />
        <KpiCard
          label="Factures a payer"
          value="24 800 €"
          detail="Statut invoice_status = unpaid"
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
              <TableRow>
                <TableCell className="font-medium">Devis terrassement</TableCell>
                <TableCell>
                  <StatusBadge status="to_confirm" />
                </TableCell>
                <TableCell className="text-right">18 500 €</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </ChartCard>
      </div>
    </section>
  )
}
