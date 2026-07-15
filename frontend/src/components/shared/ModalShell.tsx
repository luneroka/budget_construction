import type { ReactNode } from 'react'
import { Eye, X } from 'lucide-react'

import { Button } from '@/components/ui/button'

export function ModalShell({
  title,
  subtitle,
  icon = <Eye className="h-5 w-5" aria-hidden="true" />,
  headerActions,
  footer,
  closeDisabled,
  onClose,
  children,
}: {
  title: ReactNode
  subtitle?: ReactNode
  icon?: ReactNode
  headerActions?: ReactNode
  footer?: ReactNode
  closeDisabled?: boolean
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
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-xl">
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

        {footer ? (
          <div className="flex items-center justify-between gap-2 border-t border-border px-5 py-3">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  )
}
