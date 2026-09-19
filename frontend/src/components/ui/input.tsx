import * as React from 'react'

import { cn } from '@/lib/utils'

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>

// `h-10` is the app's one form-field height, shared with <Select> and
// Button's default size. Don't override it per call site: a field set to
// another height stops lining up with its neighbours.
export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        'flex h-10 w-full rounded-md border border-input bg-white px-3 py-2 text-sm',
        'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        'read-only:bg-muted/30 disabled:cursor-not-allowed disabled:bg-muted/30 disabled:opacity-100',
        className,
      )}
      {...props}
    />
  ),
)

Input.displayName = 'Input'
