import { Download } from 'lucide-react'

import { Button } from '@/components/ui/button'

type DocumentViewerDialogProps = {
  title: string
  url: string
  isPending?: boolean
  error?: string | null
  onClose: () => void
  onDownload?: () => void
}

export function DocumentViewerDialog({
  title,
  url,
  isPending = false,
  error,
  onClose,
  onDownload,
}: DocumentViewerDialogProps) {
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
          </div>
          <div className="flex items-center gap-2">
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
