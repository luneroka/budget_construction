import * as React from 'react'

import { Input } from '@/components/ui/input'
import {
  AMOUNT_GROUP_SEPARATOR,
  amountFromDisplay,
  formatAmountDisplay,
  isSameAmount,
  reformatAmountInput,
} from '@/lib/amountInput'

export type AmountInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'value' | 'defaultValue' | 'onChange' | 'type'
> & {
  /** The plain value, "2100.5". */
  value: string
  onValueChange?: (value: string) => void
}

// A money field written the French way: « 2 100,50 ». Thousands group as the
// digits are typed, a dot or a comma starts the cents, and leaving the field
// writes them out (« 2 100,00 »). The form only ever sees the plain value.
export function AmountInput({
  value,
  onValueChange,
  onFocus,
  onBlur,
  onKeyDown,
  ...props
}: AmountInputProps) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const pendingCaret = React.useRef<number | null>(null)
  const [isFocused, setIsFocused] = React.useState(false)
  const [display, setDisplay] = React.useState(() =>
    formatAmountDisplay(value, { complete: true }),
  )
  const [shownValue, setShownValue] = React.useState(value)

  // The value changed from outside (HT recalculated from the TTC, a
  // prefill): show it, unless it is what the field already says.
  if (value !== shownValue) {
    setShownValue(value)
    if (!isSameAmount(value, amountFromDisplay(display))) {
      setDisplay(formatAmountDisplay(value, { complete: !isFocused }))
    }
  }

  React.useLayoutEffect(() => {
    if (pendingCaret.current === null || !inputRef.current) return
    inputRef.current.setSelectionRange(
      pendingCaret.current,
      pendingCaret.current,
    )
    pendingCaret.current = null
  })

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const { value: raw, selectionStart } = event.target
    const next = reformatAmountInput(raw, selectionStart ?? raw.length)
    const nextValue = amountFromDisplay(next.display)
    pendingCaret.current = next.caret
    setDisplay(next.display)
    setShownValue(nextValue)
    onValueChange?.(nextValue)
  }

  // Backspace or Delete next to a thousands space removes the digit beyond
  // it; the space alone would only come back.
  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    const input = event.currentTarget
    const { selectionStart: start, selectionEnd: end } = input
    if (start !== null && start === end) {
      if (
        event.key === 'Backspace' &&
        input.value[start - 1] === AMOUNT_GROUP_SEPARATOR
      ) {
        input.setSelectionRange(start - 1, start - 1)
      } else if (
        event.key === 'Delete' &&
        input.value[start] === AMOUNT_GROUP_SEPARATOR
      ) {
        input.setSelectionRange(start + 1, start + 1)
      }
    }
    onKeyDown?.(event)
  }

  return (
    <Input
      ref={inputRef}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={display}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      onFocus={(event) => {
        setIsFocused(true)
        onFocus?.(event)
      }}
      onBlur={(event) => {
        setIsFocused(false)
        setDisplay(
          formatAmountDisplay(amountFromDisplay(display), { complete: true }),
        )
        onBlur?.(event)
      }}
      {...props}
    />
  )
}
