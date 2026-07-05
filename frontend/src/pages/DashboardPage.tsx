import {
  CircleDollarSign,
  FileClock,
  HandCoins,
  ReceiptText,
  Scale,
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
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

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
import { formatCurrency, formatDate, formatMonth } from '@/lib/format'

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

const transactionTypeLabels: Record<string, string> = {
  quote: 'Devis',
  diy_estimate: 'Estimations DIY',
  invoice: 'Factures',
}

const invoiceStatusLabels: Record<string, string> = {
  paid: 'Payées',
  unpaid: 'À payer',
  on_hold: 'En attente',
}

function currencyTooltip(value: unknown) {
  return formatCurrency(Number(value ?? 0))
}

function invoicePieLabel(entry: unknown) {
  const status = (entry as { status?: string }).status
  return invoiceStatusLabels[String(status)]
}

export function DashboardPage() {
  const {
    categoryBudgetActual,
    financialSummary,
    invoiceStatusTotals,
    monthlyInvoiceActivity,
    recentTransactions,
    transactionCounts,
    varianceProducts,
  } = dashboardViewModel
  const invoicePieData = invoiceStatusTotals.filter((item) => item.amount_ttc > 0)
  const monthlyData = monthlyInvoiceActivity.map((item) => ({
    ...item,
    label: formatMonth(item.month),
  }))
  const transactionCountData = transactionCounts.map((item) => ({
    ...item,
    label: transactionTypeLabels[item.transaction_type],
  }))

  return (
    <section>
      <PageHeader
        eyebrow="Vue projet"
        title="Tableau de bord"
        description={`Aperçu financier pour ${dashboardViewModel.project.name}. Données dérivées des seeds backend.`}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <KpiCard
          label="Budget"
          value={formatCurrency(financialSummary.selected_budget_amount_ttc)}
          icon={CircleDollarSign}
          tone="gold"
        />
        <KpiCard
          label="Coût facturé"
          value={formatCurrency(financialSummary.actual_cost_amount_ttc)}
          icon={ReceiptText}
          tone="primary"
        />
        <KpiCard
          label="Factures payées"
          value={formatCurrency(financialSummary.paid_invoice_amount_ttc)}
          icon={WalletCards}
          tone="success"
        />
        <KpiCard
          label="Factures à payer"
          value={formatCurrency(financialSummary.unpaid_invoice_amount_ttc)}
          icon={FileClock}
          tone="warning"
        />
        <KpiCard
          label="Écart budget"
          value={formatCurrency(financialSummary.selected_budget_variance_ttc)}
          detail="Budget - coût facturé"
          icon={Scale}
          tone={
            financialSummary.selected_budget_variance_ttc >= 0
              ? 'success'
              : 'destructive'
          }
        />
        <KpiCard
          label="Devis validés"
          value={String(financialSummary.validated_quote_count)}
          detail={formatCurrency(financialSummary.validated_quote_amount_ttc)}
          icon={HandCoins}
          tone="accent"
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <ChartCard
          title="Budget vs coût facturé"
          description="Montants TTC agrégés par catégorie."
        >
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categoryBudgetActual}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartColors.border} />
                <XAxis
                  dataKey="category_name"
                  tick={{ fontSize: 11, fill: chartColors.mutedForeground }}
                  interval={0}
                  angle={-20}
                  textAnchor="end"
                  height={80}
                />
                <YAxis
                  tick={{ fontSize: 12, fill: chartColors.mutedForeground }}
                  tickFormatter={(value) => `${Math.round(Number(value) / 1000)} k€`}
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
                  name="Coût facturé"
                  fill={chartColors.primary}
                  radius={[3, 3, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard
          title="Répartition des factures"
          description="Payées, à payer et en attente."
        >
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={invoicePieData}
                  dataKey="amount_ttc"
                  nameKey="status"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label={invoicePieLabel}
                >
                  {invoicePieData.map((item) => (
                    <Cell
                      key={item.status}
                      fill={
                        item.status === 'paid'
                          ? chartColors.success
                          : item.status === 'unpaid'
                            ? chartColors.warning
                            : chartColors.accent
                      }
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value, _name, item) => [
                    currencyTooltip(value),
                    invoiceStatusLabels[
                      String((item.payload as { status?: string }).status)
                    ],
                  ]}
                />
                <Legend
                  formatter={(value) => invoiceStatusLabels[String(value)]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard
          title="Activité mensuelle des factures"
          description="Montant TTC des factures émises par mois."
        >
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartColors.border} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 12, fill: chartColors.mutedForeground }}
                />
                <YAxis
                  tick={{ fontSize: 12, fill: chartColors.mutedForeground }}
                  tickFormatter={(value) => `${Math.round(Number(value) / 1000)} k€`}
                />
                <Tooltip formatter={currencyTooltip} />
                <Line
                  type="monotone"
                  dataKey="amount_ttc"
                  name="Factures émises"
                  stroke={chartColors.accent}
                  strokeWidth={2}
                  dot={{ r: 2, fill: chartColors.accent }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard
          title="Nombre de transactions"
          description="Devis, estimations DIY et factures."
        >
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={transactionCountData}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartColors.border} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 12, fill: chartColors.mutedForeground }}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 12, fill: chartColors.mutedForeground }}
                />
                <Tooltip />
                <Bar dataKey="count" name="Transactions" radius={[3, 3, 0, 0]}>
                  {transactionCountData.map((item) => (
                    <Cell
                      key={item.transaction_type}
                      fill={
                        item.transaction_type === 'quote'
                          ? chartColors.accent
                          : item.transaction_type === 'diy_estimate'
                            ? chartColors.gold
                            : chartColors.primary
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <ChartCard title="Transactions récentes">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Transaction</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="text-right">Montant TTC</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentTransactions.map((transaction) => (
                <TableRow key={transaction.id}>
                  <TableCell>{formatDate(transaction.issued_date)}</TableCell>
                  <TableCell>
                    <p className="font-medium">{transaction.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {transaction.supplier_name ?? 'Sans fournisseur'}
                    </p>
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
                  <TableCell className="text-right font-medium">
                    {formatCurrency(transaction.amount_ttc)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ChartCard>

        <ChartCard title="Écarts par produit">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produit</TableHead>
                <TableHead>Catégorie</TableHead>
                <TableHead className="text-right">Écart</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {varianceProducts.map((product) => (
                <TableRow key={product.product_id}>
                  <TableCell className="font-medium">
                    {product.product_name}
                  </TableCell>
                  <TableCell>{product.category_name}</TableCell>
                  <TableCell
                    className={`text-right font-medium ${
                      product.selected_budget_variance_ttc < 0
                        ? 'text-destructive'
                        : 'text-success'
                    }`}
                  >
                    {formatCurrency(product.selected_budget_variance_ttc)}
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
