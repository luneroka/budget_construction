import { ChevronLeft, ChevronRight, Download } from 'lucide-react'

import { Button } from '@/components/ui/button'

type DocumentViewerDialogProps = {
  title: string
  subtitle?: string
  url: string
  isPending?: boolean
  error?: string | null
  onClose: () => void
  onDownload?: () => void
  onPrevious?: () => void
  onNext?: () => void
  hasPrevious?: boolean
  hasNext?: boolean
}

export function DocumentViewerDialog({
  title,
  subtitle,
  url,
  isPending = false,
  error,
  onClose,
  onDownload,
  onPrevious,
  onNext,
  hasPrevious = false,
  hasNext = false,
}: DocumentViewerDialogProps) {
  const canNavigate = Boolean(onPrevious || onNext)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 px-4 py-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="document-viewer-dialog-title"
    >
      <div className="flex h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <p
              id="document-viewer-dialog-title"
              className="text-base font-semibold"
            >
              {title}
            </p>
            {subtitle ? (
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {subtitle}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {onDownload ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={onDownload}
                disabled={isPending}
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                Télécharger
              </Button>
            ) : null}
            <Button size="sm" variant="outline" onClick={onClose}>
              Fermer
            </Button>
            {canNavigate ? (
              <div className="flex items-center gap-1 border-l border-border pl-2">
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Document précédent"
                  disabled={!onPrevious || !hasPrevious}
                  onClick={onPrevious}
                >
                  <ChevronLeft aria-hidden />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Document suivant"
                  disabled={!onNext || !hasNext}
                  onClick={onNext}
                >
                  <ChevronRight aria-hidden />
                </Button>
              </div>
            ) : null}
          </div>
        </div>

        {error ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center text-sm text-destructive">
            <p>Impossible d’afficher le document.</p>
            <p className="mt-2 text-muted-foreground">{error}</p>
          </div>
        ) : (
          <div className="relative flex-1 overflow-hidden bg-black">
            <iframe
              src={url}
              title={title}
              className="h-full w-full border-0 bg-black"
            />
          </div>
        )}
      </div>
    </div>
  )
}
