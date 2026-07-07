import type { ReactNode } from 'react'
import { Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'

type ConfirmationDialogProps = {
  title: string
  description: string
  children?: ReactNode
  error?: string | null
  isPending?: boolean
  confirmLabel?: string
  pendingLabel?: string
  cancelLabel?: string
  onCancel: () => void
  onConfirm: () => void
}

export function ConfirmationDialog({
  title,
  description,
  children,
  error,
  isPending = false,
  confirmLabel = 'Supprimer',
  pendingLabel = 'Suppression...',
  cancelLabel = 'Annuler',
  onCancel,
  onConfirm,
}: ConfirmationDialogProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 px-4 py-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirmation-dialog-title"
    >
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 text-foreground shadow-lg">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-destructive/10 text-destructive">
            <Trash2 className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p
              id="confirmation-dialog-title"
              className="font-heading text-xl font-semibold"
            >
              {title}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">{description}</p>
            {children ? (
              <div className="mt-4 rounded-md border border-border bg-background px-3 py-2 text-sm">
                {children}
              </div>
            ) : null}
            {error ? (
              <p className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel} disabled={isPending}>
            {cancelLabel}
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={isPending}
          >
            {isPending ? pendingLabel : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
