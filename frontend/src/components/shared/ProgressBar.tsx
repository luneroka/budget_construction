import { cn } from '@/lib/utils'

type ProgressBarProps = {
  value: number
  max?: number
  tone?: 'primary' | 'success' | 'warning' | 'destructive'
  label?: string
}

const toneClasses = {
  primary: 'bg-primary',
  success: 'bg-success',
  warning: 'bg-warning',
  destructive: 'bg-destructive',
}

export function ProgressBar({
  value,
  max = 100,
  tone = 'primary',
  label,
}: ProgressBarProps) {
  const percent = Math.min(100, Math.max(0, (value / max) * 100))

  return (
    <div>
      {label ? (
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-medium text-foreground">{label}</span>
          <span className="text-muted-foreground">{Math.round(percent)}%</span>
        </div>
      ) : null}
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full transition-all', toneClasses[tone])}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}
