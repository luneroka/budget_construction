import { Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import type { TransactionDeleteState } from '@/components/budget/types'
import { formatCurrency, formatDate } from '@/lib/format'

export function DeleteTransactionDialog({
  context,
  onCancel,
  onConfirm,
}: {
  context: TransactionDeleteState
  onCancel: () => void
  onConfirm: () => void
}) {
  const { budgetLine, product, transaction } = context

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 px-4 py-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-transaction-title"
    >
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 text-foreground shadow-lg">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-destructive/10 text-destructive">
            <Trash2 className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p
              id="delete-transaction-title"
              className="font-heading text-xl font-semibold"
            >
              Supprimer cette transaction ?
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Cette action demandera confirmation avant suppression. Le
              raccordement à l'API sera ajouté ultérieurement.
            </p>
            <div className="mt-4 rounded-md border border-border bg-background px-3 py-2 text-sm">
              <p className="font-medium text-foreground">
                {transaction.supplier_name ?? 'Autoconstruction'}
              </p>
              <p className="mt-1 text-muted-foreground">
                {product.product_name} · {budgetLine.name}
              </p>
              <p className="mt-1 text-muted-foreground">
                {formatDate(transaction.issued_date)} ·{' '}
                {formatCurrency(transaction.amount_ttc)}
              </p>
            </div>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel}>
            Annuler
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            Supprimer
          </Button>
        </div>
      </div>
    </div>
  )
}
