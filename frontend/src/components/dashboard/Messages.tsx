import { RotateCw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function DashboardMessage({ children }: { children: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-card p-6 text-sm text-muted-foreground">
      {children}
    </div>
  )
}

export function DashboardChartMessage({ children }: { children: string }) {
  return (
    <div className="flex h-72 items-center justify-center rounded-md border border-dashed border-border text-sm text-muted-foreground">
      {children}
    </div>
  )
}

export function DashboardWidgetMessage({ children }: { children: string }) {
  return (
    <div className="flex min-h-36 items-center justify-center rounded-md border border-dashed border-border px-4 text-center text-sm text-muted-foreground">
      {children}
    </div>
  )
}

// A chart or widget that could not load: never mistaken for an empty one,
// and never the API's own text. Réessayer loads it again.
export function DashboardLoadError({
  message,
  onRetry,
  size = 'chart',
}: {
  message: string
  onRetry: () => void
  size?: 'chart' | 'widget' | 'block'
}) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-md border border-dashed border-destructive/30 px-4 text-center text-sm text-destructive',
        size === 'chart' && 'h-72',
        size === 'widget' && 'min-h-36',
        size === 'block' && 'rounded-lg bg-card p-6',
      )}
    >
      {message}
      <Button size="sm" variant="outline" onClick={onRetry}>
        <RotateCw aria-hidden />
        Réessayer
      </Button>
    </div>
  )
}
