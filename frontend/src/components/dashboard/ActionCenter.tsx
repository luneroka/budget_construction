import type { ReactNode } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ChartCard } from '@/components/shared/ChartCard'
import type {
  DashboardBudgetAlertRead,
  DashboardTransactionWidgetItemRead,
  DashboardTransactionWidgetRead,
} from '@/api/types'
import { getApiErrorMessage } from '@/api/client'
import { formatCurrency, formatDate } from '@/lib/format'
import { DashboardWidgetMessage } from './Messages'
import { DashboardWidgetSkeleton } from './Skeletons'
import { decimalToNumber } from './utils'

export function ActionCenterWidget({
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

export function TransactionWidgetContent({
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

export function BudgetAlertsWidgetContent({
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
