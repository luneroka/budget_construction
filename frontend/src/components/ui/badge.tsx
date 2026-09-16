import * as React from 'react'

import { cn } from '@/lib/utils'

export type BadgeVariant =
  | 'default'
  | 'secondary'
  | 'accent'
  | 'gold'
  | 'success'
  | 'warning'
  | 'destructive'
  | 'muted'

export type BadgeTone = 'solid' | 'soft'

const badgeVariants: Record<BadgeVariant, string> = {
  default: 'bg-primary text-primary-foreground',
  secondary: 'bg-secondary text-secondary-foreground',
  accent: 'bg-accent text-accent-foreground',
  gold: 'bg-gold text-gold-foreground',
  success: 'bg-success text-success-foreground',
  warning: 'bg-warning text-warning-foreground',
  destructive: 'bg-destructive text-destructive-foreground',
  muted: 'bg-muted text-muted-foreground',
}

// Soft tone: a tinted ground with the colour carried by the text rather than a
// filled block, for badges that appear on most rows of a table where solid
// colour turns a list into a patchwork. Same treatment as ccig-app, which
// shares this palette exactly. `secondary` and `muted` are already pale and
// stay as they are -- a tint of themselves would be near-invisible.
const softBadgeVariants: Record<BadgeVariant, string> = {
  default: 'bg-primary/15 text-primary',
  secondary: 'bg-secondary text-secondary-foreground',
  accent: 'bg-accent/15 text-accent',
  gold: 'bg-gold/15 text-gold',
  success: 'bg-success/15 text-success',
  warning: 'bg-warning/15 text-warning',
  destructive: 'bg-destructive/15 text-destructive',
  muted: 'bg-muted text-muted-foreground',
}

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  variant?: BadgeVariant
  tone?: BadgeTone
}

export function Badge({
  className,
  variant = 'default',
  tone = 'solid',
  ...props
}: BadgeProps) {
  const variants = tone === 'soft' ? softBadgeVariants : badgeVariants

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-1 text-xs font-medium',
        variants[variant],
        className,
      )}
      {...props}
    />
  )
}
