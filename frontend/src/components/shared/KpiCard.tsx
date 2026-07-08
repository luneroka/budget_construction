import type { ComponentType } from 'react'

import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

type KpiCardProps = {
  label: string
  value: string
  detail?: string
  icon?: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>
  tone?: 'primary' | 'accent' | 'gold' | 'success' | 'warning' | 'destructive'
}

const toneClasses = {
  primary: 'text-primary',
  accent: 'text-accent',
  gold: 'text-gold',
  success: 'text-success',
  warning: 'text-warning',
  destructive: 'text-destructive',
}

export function KpiCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = 'primary',
}: KpiCardProps) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-4">
        <span className="text-xs font-medium text-muted-foreground">
          {label}
        </span>
        {Icon ? (
          <Icon
            className={cn('h-4 w-4 shrink-0', toneClasses[tone])}
            aria-hidden
          />
        ) : null}
      </div>
      <p className="mt-2 text-2xl font-bold text-foreground">{value}</p>
      {detail ? (
        <p className="mt-2 text-sm text-muted-foreground">{detail}</p>
      ) : null}
    </Card>
  )
}
