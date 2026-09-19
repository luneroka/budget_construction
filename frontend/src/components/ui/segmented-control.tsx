import * as React from 'react'

import { cn } from '@/lib/utils'

export type SegmentedOption<T extends string> = {
  value: T
  label: React.ReactNode
}

// A row of mutually exclusive choices for the fields whose options fit on one
// line (a transaction's type, its status, a VAT rate): every option stays in
// sight and one click picks it. 40px like every field, 14px like field
// values; a radio group, so the arrow keys move the choice.
export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  disabled,
  className,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
}: {
  value: T | null
  options: SegmentedOption<T>[]
  onChange: (value: T) => void
  disabled?: boolean
  className?: string
  'aria-label'?: string
  'aria-labelledby'?: string
}) {
  const refs = React.useRef<(HTMLButtonElement | null)[]>([])
  const selectedIndex = options.findIndex((option) => option.value === value)

  function handleKeyDown(event: React.KeyboardEvent, index: number) {
    const step =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? -1
          : 0
    if (step === 0) return
    event.preventDefault()
    const next = (index + step + options.length) % options.length
    onChange(options[next].value)
    refs.current[next]?.focus()
  }

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      className={cn(
        'inline-flex h-10 max-w-full overflow-x-auto rounded-md border border-input bg-white',
        className,
      )}
    >
      {options.map((option, index) => {
        const isSelected = index === selectedIndex
        return (
          <button
            key={option.value}
            ref={(node) => {
              refs.current[index] = node
            }}
            type="button"
            role="radio"
            aria-checked={isSelected}
            // Roving focus: Tab enters on the chosen option (or the first).
            tabIndex={
              isSelected || (selectedIndex === -1 && index === 0) ? 0 : -1
            }
            disabled={disabled}
            className={cn(
              'shrink-0 px-3 text-sm whitespace-nowrap transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
              'disabled:cursor-not-allowed disabled:opacity-60',
              index > 0 && 'border-l border-input',
              isSelected
                ? 'bg-primary text-primary-foreground'
                : 'text-foreground hover:bg-muted',
            )}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
