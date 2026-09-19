import type { ReactNode } from 'react'
import { Check, Eye, Trash2, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function ModalShell({
  title,
  subtitle,
  icon = <Eye className="h-5 w-5" aria-hidden="true" />,
  headerActions,
  footer,
  footerLeading,
  closeDisabled,
  size = 'default',
  onClose,
  children,
}: {
  title: ReactNode
  subtitle?: ReactNode
  icon?: ReactNode
  headerActions?: ReactNode
  /** Primary actions. Always grouped at the trailing edge. */
  footer?: ReactNode
  /**
   * A secondary action set apart from the primary ones — deleting the thing
   * the modal is about, typically. Sits at the leading edge, far enough from
   * Enregistrer that it cannot be hit by accident.
   */
  footerLeading?: ReactNode
  closeDisabled?: boolean
  /** `narrow` for a single form (a transaction); `default` for wide content. */
  size?: 'default' | 'narrow'
  onClose: () => void
  children: ReactNode
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-3 py-4"
      role="dialog"
      aria-modal="true"
      aria-label={typeof title === 'string' ? title : undefined}
    >
      <div
        className={cn(
          'flex max-h-[92vh] w-full flex-col overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-xl',
          size === 'narrow' ? 'max-w-2xl' : 'max-w-5xl',
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            {icon ? (
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gold/15 text-gold">
                {icon}
              </span>
            ) : null}
            <div className="min-w-0">
              <p className="truncate text-base font-semibold">{title}</p>
              {subtitle ? (
                <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
              ) : null}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {headerActions}
            <Button
              size="icon"
              variant="ghost"
              aria-label="Fermer"
              disabled={closeDisabled}
              onClick={onClose}
            >
              <X aria-hidden />
            </Button>
          </div>
        </div>

        <div className="overflow-y-auto px-5 py-4 text-sm">{children}</div>

        {footer || footerLeading ? (
          <div className="flex items-center justify-between gap-2 border-t border-border px-5 py-3">
            <div className="flex items-center gap-2">{footerLeading}</div>
            <div className="flex items-center justify-end gap-2">{footer}</div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

export function ModalCancelButton({
  onClick,
  disabled,
  children = 'Annuler',
}: {
  onClick: () => void
  disabled?: boolean
  children?: ReactNode
}) {
  return (
    <Button
      variant="outline"
      type="button"
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </Button>
  )
}

export function ModalCloseButton({
  onClick,
  disabled,
  children = 'Fermer',
}: {
  onClick: () => void
  disabled?: boolean
  children?: ReactNode
}) {
  return (
    <Button
      variant="outline"
      type="button"
      onClick={onClick}
      disabled={disabled}
    >
      <X aria-hidden />
      {children}
    </Button>
  )
}

export function ModalSaveButton({
  type = 'submit',
  form,
  onClick,
  disabled,
  isSaving,
  savingLabel = 'Enregistrement...',
  children = 'Enregistrer',
}: {
  type?: 'button' | 'submit'
  form?: string
  onClick?: () => void
  disabled?: boolean
  isSaving?: boolean
  savingLabel?: string
  children?: ReactNode
}) {
  return (
    <Button
      type={type}
      form={form}
      variant="gold"
      onClick={onClick}
      disabled={disabled}
    >
      <Check aria-hidden />
      {isSaving ? savingLabel : children}
    </Button>
  )
}

export function ModalDeleteButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <Button
      variant="destructiveOutline"
      type="button"
      onClick={onClick}
      disabled={disabled}
    >
      <Trash2 aria-hidden />
      {children}
    </Button>
  )
}
