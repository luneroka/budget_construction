import type { ApiDecimal } from '@/api/types'
import { formatCurrency } from '@/lib/format'

export const chartColors = {
  primary: 'hsl(var(--primary))',
  accent: 'hsl(var(--accent))',
  gold: 'hsl(var(--gold))',
  success: 'hsl(var(--success))',
  warning: 'hsl(var(--warning))',
  destructive: 'hsl(var(--destructive))',
  border: 'hsl(var(--border))',
  mutedForeground: 'hsl(var(--muted-foreground))',
}

export const distributionColors = [
  chartColors.primary,
  chartColors.accent,
  chartColors.gold,
  chartColors.success,
  chartColors.warning,
  chartColors.destructive,
]

export function decimalToNumber(
  value: ApiDecimal | number | null | undefined,
): number {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

export function formatDashboardPercentage(value: ApiDecimal): string {
  return `${new Intl.NumberFormat('fr-FR', {
    maximumFractionDigits: 1,
  }).format(decimalToNumber(value))} %`
}

export function currencyTooltip(value: unknown) {
  return formatCurrency(decimalToNumber(value as ApiDecimal | number))
}
