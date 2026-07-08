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
import type { QuickViewId } from '@/lib/transactionWorkspace'
import { formatCurrency, formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { DashboardWidgetMessage } from './Messages'
import { DashboardWidgetSkeleton } from './Skeletons'
import { decimalToNumber } from './utils'

export function ActionCenterWidget({
  children,
  count,
  title,
  showActionButton = true,
  showCountBadge = true,
  onViewAll,
}: {
  children: ReactNode
  count?: number
  title: string
  showActionButton?: boolean
  showCountBadge?: boolean
  onViewAll?: () => void
}) {
  const actionContent = (
    <div className="flex items-center gap-2">
      {showCountBadge ? (
        <Badge variant={(count ?? 0) > 0 ? 'default' : 'muted'}>
          {count ?? 0}
        </Badge>
      ) : null}
      {showActionButton ? (
        <Button size="sm" variant="outline" onClick={onViewAll}>
          Voir tout
        </Button>
      ) : null}
    </div>
  )

  return (
    <ChartCard title={title} action={actionContent}>
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
  maxItems,
  onItemClick,
}: {
  emptyMessage: string
  error: unknown
  isError: boolean
  isLoading: boolean
  widget?: DashboardTransactionWidgetRead
  maxItems?: number
  quickView?: QuickViewId
  onItemClick?: (item: DashboardTransactionWidgetItemRead) => void
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

  const items = maxItems ? widget.items.slice(0, maxItems) : widget.items

  return (
    <div className="divide-y divide-border">
      {items.map((item) => (
        <button
          type="button"
          key={item.transaction_id}
          className={cn(
            'grid w-full grid-cols-[1fr_auto] gap-3 py-3 text-left first:pt-0 last:pb-0',
            onItemClick &&
              'rounded-sm transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          )}
          onClick={() => onItemClick?.(item)}
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
        </button>
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
  maxItems,
  onItemClick,
}: {
  emptyMessage: string
  error: unknown
  isError: boolean
  isLoading: boolean
  items?: DashboardBudgetAlertRead[]
  maxItems?: number
  onItemClick?: (item: DashboardBudgetAlertRead) => void
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

  const displayedItems = [...(items ?? [])]
    .sort(
      (a, b) =>
        Math.abs(Number(b.variance_ttc)) - Math.abs(Number(a.variance_ttc)),
    )
    .slice(0, maxItems ?? items?.length ?? 0)

  return (
    <div className="divide-y divide-border">
      {displayedItems.map((item) => (
        <button
          type="button"
          key={item.product_id}
          className={cn(
            'grid w-full grid-cols-[1fr_auto] gap-3 py-3 text-left first:pt-0 last:pb-0',
            onItemClick &&
              'rounded-sm transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          )}
          onClick={() => onItemClick?.(item)}
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
        </button>
      ))}
    </div>
  )
}
