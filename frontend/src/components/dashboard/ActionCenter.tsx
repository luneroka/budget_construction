import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ChartCard } from '@/components/shared/ChartCard'
import type {
  DashboardSupplierDocumentRead,
  DashboardTransactionWidgetItemRead,
  DashboardTransactionWidgetRead,
} from '@/api/types'
import { formatCurrency, formatDate } from '@/lib/format'
import {
  type ExpirySignal,
  expirySignalLabels,
  supplierDocumentTypeLabels,
} from '@/lib/supplierDocuments'
import { transactionDisplayTitle } from '@/lib/transactionWorkspace'
import { cn } from '@/lib/utils'
import { DashboardLoadError, DashboardWidgetMessage } from './Messages'
import { DashboardWidgetSkeleton } from './Skeletons'
import { decimalToNumber } from '@/lib/apiAdapters'

const WIDGET_LOAD_ERROR = 'Impossible de charger cette liste.'

const itemClassName =
  'grid w-full grid-cols-[1fr_auto] gap-3 py-3 text-left first:pt-0 last:pb-0'
const clickableItemClassName =
  'rounded-sm transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'

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
        <Button variant="outline" disabled={!onViewAll} onClick={onViewAll}>
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
  return transactionDisplayTitle(item)
}

export function TransactionWidgetContent({
  emptyMessage,
  isError,
  isLoading,
  widget,
  maxItems,
  onItemClick,
  onRetry,
}: {
  emptyMessage: string
  isError: boolean
  isLoading: boolean
  widget?: DashboardTransactionWidgetRead
  maxItems?: number
  onItemClick?: (item: DashboardTransactionWidgetItemRead) => void
  onRetry: () => void
}) {
  if (isLoading) return <DashboardWidgetSkeleton />
  if (isError) {
    return (
      <DashboardLoadError
        size="widget"
        message={WIDGET_LOAD_ERROR}
        onRetry={onRetry}
      />
    )
  }
  if (!widget || widget.items.length === 0) {
    return <DashboardWidgetMessage>{emptyMessage}</DashboardWidgetMessage>
  }

  const items = maxItems ? widget.items.slice(0, maxItems) : widget.items

  return (
    <div className="divide-y divide-border">
      {items.map((item) => {
        const content = (
          <>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">
                {transactionItemTitle(item)}
              </p>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {[`${item.lot_code} · ${item.lot_designation}`, item.reference]
                  .filter(Boolean)
                  .join(' · ')}
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
          </>
        )
        const className = cn(
          itemClassName,
          onItemClick && clickableItemClassName,
        )

        return onItemClick ? (
          <button
            type="button"
            key={item.transaction_id}
            className={className}
            onClick={() => onItemClick(item)}
          >
            {content}
          </button>
        ) : (
          <div key={item.transaction_id} className={className}>
            {content}
          </div>
        )
      })}
    </div>
  )
}

const signalClassNames: Record<ExpirySignal, string> = {
  expired: 'text-destructive',
  expiring_soon: 'text-warning',
}

// « Documents fournisseurs »: the documents of the project's suppliers that
// are expired or expire within 30 days, each opening its supplier's
// Documents tab.
export function SupplierDocumentsWidgetContent({
  documents,
  isError,
  isLoading,
  onRetry,
}: {
  documents: Array<DashboardSupplierDocumentRead & { signal: ExpirySignal }>
  isError: boolean
  isLoading: boolean
  onRetry: () => void
}) {
  if (isLoading) return <DashboardWidgetSkeleton />
  if (isError) {
    return (
      <DashboardLoadError
        size="widget"
        message={WIDGET_LOAD_ERROR}
        onRetry={onRetry}
      />
    )
  }
  if (documents.length === 0) {
    return (
      <DashboardWidgetMessage>
        Aucun document fournisseur expiré ou à renouveler.
      </DashboardWidgetMessage>
    )
  }

  return (
    <div className="divide-y divide-border">
      {documents.map((document) => (
        <Link
          key={document.id}
          to={`/suppliers/${document.supplier_id}/documents`}
          className={cn(itemClassName, clickableItemClassName)}
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">
              {supplierDocumentTypeLabels[document.type]}
            </p>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {document.supplier_name}
            </p>
          </div>
          <div className="text-right">
            <p
              className={cn(
                'text-sm font-semibold',
                signalClassNames[document.signal],
              )}
            >
              {expirySignalLabels[document.signal]}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {formatDate(document.expiry_date)}
            </p>
          </div>
        </Link>
      ))}
    </div>
  )
}
