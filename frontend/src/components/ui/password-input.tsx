import * as React from 'react'
import { Eye, EyeOff } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Input, type InputProps } from '@/components/ui/input'

export type PasswordInputProps = Omit<InputProps, 'type'> & {
  isVisible: boolean
  onVisibilityChange: (isVisible: boolean) => void
}

export const PasswordInput = React.forwardRef<
  HTMLInputElement,
  PasswordInputProps
>(({ className, isVisible, onVisibilityChange, disabled, ...props }, ref) => {
  const Icon = isVisible ? EyeOff : Eye
  const label = isVisible
    ? 'Masquer le mot de passe'
    : 'Afficher le mot de passe'

  return (
    <div className="relative">
      <Input
        ref={ref}
        type={isVisible ? 'text' : 'password'}
        className={cn('pr-11', className)}
        disabled={disabled}
        {...props}
      />
      <button
        type="button"
        className="absolute right-1 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-gold/15 hover:text-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
        aria-label={label}
        title={label}
        disabled={disabled}
        onClick={() => onVisibilityChange(!isVisible)}
      >
        <Icon className="h-4 w-4" aria-hidden />
      </button>
    </div>
  )
})

PasswordInput.displayName = 'PasswordInput'
