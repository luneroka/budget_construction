import * as React from 'react'

import {
  type ButtonSize,
  type ButtonVariant,
  buttonVariants,
} from '@/components/ui/button-variants'

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={buttonVariants({ variant, size, className })}
      {...props}
    />
  ),
)

Button.displayName = 'Button'
