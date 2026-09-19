import * as React from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'

import { cn } from '@/lib/utils'

// Drop-in replacement for a native <select>: same props, same `<option>`
// children, same `onChange(event)` with `event.target.value` — but the
// closed control *and* the open list are drawn by us, so they look the
// same in every browser/OS instead of the platform's popup. A real
// <select> stays in the DOM (visually hidden) so forms, `name`, and the
// React change event contract keep working unchanged.
export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>

type Item = { value: string; label: string; disabled: boolean }

function textOf(node: React.ReactNode): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) {
    return textOf(node.props.children)
  }
  return ''
}

function collectItems(children: React.ReactNode, into: Item[] = []): Item[] {
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return
    if (child.type === 'option') {
      const props = child.props as React.OptionHTMLAttributes<HTMLOptionElement>
      const label = textOf(props.children)
      into.push({
        value: props.value == null ? label : String(props.value),
        label,
        disabled: Boolean(props.disabled),
      })
      return
    }
    collectItems((child.props as { children?: React.ReactNode }).children, into)
  })
  return into
}

type ListPosition = { top: number; left: number; minWidth: number }

const LIST_GAP = 4
const VIEWPORT_MARGIN = 8

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      className,
      children,
      value,
      defaultValue,
      onChange,
      disabled,
      id,
      title,
      'aria-label': ariaLabel,
      'aria-labelledby': ariaLabelledBy,
      ...rest
    },
    forwardedRef,
  ) => {
    const items = React.useMemo(() => collectItems(children), [children])
    const isControlled = value !== undefined
    const [innerValue, setInnerValue] = React.useState(() =>
      defaultValue != null
        ? String(defaultValue)
        : (items.find((item) => !item.disabled)?.value ?? ''),
    )
    const currentValue = isControlled ? String(value) : innerValue
    // Like a native select: an unmatched value falls back to the first option.
    const selectedIndex = Math.max(
      0,
      items.findIndex((item) => item.value === currentValue),
    )
    const selected = items[selectedIndex]

    const [isOpen, setIsOpen] = React.useState(false)
    const [highlighted, setHighlighted] = React.useState(selectedIndex)
    const [position, setPosition] = React.useState<ListPosition | null>(null)

    const selectRef = React.useRef<HTMLSelectElement | null>(null)
    const buttonRef = React.useRef<HTMLButtonElement>(null)
    const listRef = React.useRef<HTMLUListElement>(null)
    const reactId = React.useId()
    const listId = `${id ?? reactId}-listbox`

    const setSelectRef = React.useCallback(
      (node: HTMLSelectElement | null) => {
        selectRef.current = node
        if (typeof forwardedRef === 'function') forwardedRef(node)
        else if (forwardedRef) forwardedRef.current = node
      },
      [forwardedRef],
    )

    const open = React.useCallback(() => {
      if (disabled || items.length === 0) return
      setHighlighted(selectedIndex)
      setIsOpen(true)
    }, [disabled, items.length, selectedIndex])

    const close = React.useCallback(() => setIsOpen(false), [])

    // Commit through the hidden native select so callers receive a real
    // React change event (`event.target.value`), exactly as before.
    const commit = React.useCallback(
      (index: number) => {
        const item = items[index]
        const node = selectRef.current
        if (!item || item.disabled || !node) return
        setIsOpen(false)
        if (item.value === currentValue) return
        node.value = item.value
        node.dispatchEvent(new Event('change', { bubbles: true }))
      },
      [currentValue, items],
    )

    const handleNativeChange = (
      event: React.ChangeEvent<HTMLSelectElement>,
    ) => {
      if (!isControlled) setInnerValue(event.target.value)
      onChange?.(event)
    }

    const moveHighlight = (from: number, step: 1 | -1) => {
      let next = from
      for (let i = 0; i < items.length; i += 1) {
        next = (next + step + items.length) % items.length
        if (!items[next].disabled) return next
      }
      return from
    }

    const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (disabled) return
      const { key } = event
      if (!isOpen) {
        if (
          ['ArrowDown', 'ArrowUp', 'Enter', ' ', 'Home', 'End'].includes(key)
        ) {
          event.preventDefault()
          open()
        }
        return
      }
      switch (key) {
        case 'ArrowDown':
          event.preventDefault()
          setHighlighted((current) => moveHighlight(current, 1))
          break
        case 'ArrowUp':
          event.preventDefault()
          setHighlighted((current) => moveHighlight(current, -1))
          break
        case 'Home':
          event.preventDefault()
          setHighlighted(moveHighlight(items.length - 1, 1))
          break
        case 'End':
          event.preventDefault()
          setHighlighted(moveHighlight(0, -1))
          break
        case 'Enter':
        case ' ':
          event.preventDefault()
          commit(highlighted)
          break
        case 'Escape':
          event.preventDefault()
          close()
          break
        case 'Tab':
          close()
          break
        default:
          if (key.length === 1 && key.trim()) {
            const needle = key.toLowerCase()
            const total = items.length
            for (let offset = 1; offset <= total; offset += 1) {
              const index = (highlighted + offset) % total
              const item = items[index]
              if (
                !item.disabled &&
                item.label.toLowerCase().startsWith(needle)
              ) {
                setHighlighted(index)
                break
              }
            }
          }
      }
    }

    // Position the list next to the trigger (fixed + portaled so it is not
    // clipped by `overflow-hidden` ancestors such as cards or ModalShell),
    // flipping above when there is more room there.
    React.useLayoutEffect(() => {
      if (!isOpen) {
        setPosition(null)
        return
      }
      const update = () => {
        const button = buttonRef.current
        const list = listRef.current
        if (!button || !list) return
        const rect = button.getBoundingClientRect()
        const listHeight = list.offsetHeight
        const listWidth = list.offsetWidth
        const spaceBelow = window.innerHeight - rect.bottom - VIEWPORT_MARGIN
        const spaceAbove = rect.top - VIEWPORT_MARGIN
        const flip =
          listHeight + LIST_GAP > spaceBelow && spaceAbove > spaceBelow
        const top = flip
          ? Math.max(VIEWPORT_MARGIN, rect.top - LIST_GAP - listHeight)
          : rect.bottom + LIST_GAP
        const left = Math.max(
          VIEWPORT_MARGIN,
          Math.min(rect.left, window.innerWidth - listWidth - VIEWPORT_MARGIN),
        )
        setPosition({ top, left, minWidth: rect.width })
      }
      update()
      window.addEventListener('resize', update)
      window.addEventListener('scroll', update, true)
      return () => {
        window.removeEventListener('resize', update)
        window.removeEventListener('scroll', update, true)
      }
    }, [isOpen])

    React.useEffect(() => {
      if (!isOpen) return
      const handlePointerDown = (event: MouseEvent | TouchEvent) => {
        const target = event.target as Node
        if (
          buttonRef.current?.contains(target) ||
          listRef.current?.contains(target)
        ) {
          return
        }
        close()
      }
      document.addEventListener('mousedown', handlePointerDown)
      document.addEventListener('touchstart', handlePointerDown)
      return () => {
        document.removeEventListener('mousedown', handlePointerDown)
        document.removeEventListener('touchstart', handlePointerDown)
      }
    }, [close, isOpen])

    React.useEffect(() => {
      if (!isOpen) return
      listRef.current
        ?.querySelector<HTMLElement>(`[data-index="${highlighted}"]`)
        ?.scrollIntoView({ block: 'nearest' })
    }, [highlighted, isOpen])

    React.useEffect(() => {
      if (disabled) setIsOpen(false)
    }, [disabled])

    // `h-10` is the app's one form-field height, shared with <Input> and
    // Button's default size, and never set per call site: every select and
    // input is 40px, so any two in a row line up. Width and font defaults
    // live in the components layer (index.css) instead, so a caller's width
    // (`w-24`) still applies.
    return (
      <div className={cn('app-select relative h-10', className)}>
        <select
          {...rest}
          ref={setSelectRef}
          value={isControlled ? value : innerValue}
          onChange={handleNativeChange}
          disabled={disabled}
          tabIndex={-1}
          aria-hidden="true"
          className="sr-only"
        >
          {children}
        </select>
        <button
          ref={buttonRef}
          type="button"
          id={id}
          title={title}
          disabled={disabled}
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-controls={isOpen ? listId : undefined}
          aria-activedescendant={
            isOpen ? `${listId}-${highlighted}` : undefined
          }
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy}
          onClick={() => (isOpen ? close() : open())}
          onKeyDown={handleKeyDown}
          className={cn(
            'flex h-full w-full items-center rounded-md border border-input bg-white pl-3 pr-9 text-left text-foreground',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            'disabled:cursor-not-allowed disabled:bg-muted/30 disabled:text-muted-foreground',
          )}
        >
          <span className="truncate">{selected?.label ?? ''}</span>
          <ChevronDown
            aria-hidden="true"
            className={cn(
              'pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground transition-transform',
              isOpen && 'rotate-180',
              disabled && 'text-border',
            )}
          />
        </button>
        {isOpen
          ? createPortal(
              <ul
                ref={listRef}
                id={listId}
                role="listbox"
                aria-label={ariaLabel}
                className="fixed z-[70] max-h-56 overflow-y-auto rounded-md border border-border bg-card py-1 text-sm text-card-foreground shadow-lg"
                style={{
                  top: position?.top ?? 0,
                  left: position?.left ?? 0,
                  minWidth: position?.minWidth ?? 0,
                  maxWidth: `calc(100vw - ${VIEWPORT_MARGIN * 2}px)`,
                  visibility: position ? 'visible' : 'hidden',
                }}
              >
                {items.map((item, index) => (
                  <li
                    key={`${item.value}-${index}`}
                    id={`${listId}-${index}`}
                    role="option"
                    aria-selected={index === selectedIndex}
                    aria-disabled={item.disabled || undefined}
                    data-index={index}
                    className={cn(
                      'relative flex select-none items-center py-1.5 pl-3 pr-9 whitespace-nowrap',
                      item.disabled
                        ? 'cursor-not-allowed opacity-50'
                        : 'cursor-pointer',
                      index === highlighted &&
                        'bg-accent text-accent-foreground',
                      index === selectedIndex && 'font-medium',
                    )}
                    onMouseMove={() => {
                      if (!item.disabled && highlighted !== index)
                        setHighlighted(index)
                    }}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => commit(index)}
                  >
                    <span className="truncate">{item.label}</span>
                    {index === selectedIndex ? (
                      <Check
                        aria-hidden="true"
                        className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2"
                      />
                    ) : null}
                  </li>
                ))}
              </ul>,
              document.body,
            )
          : null}
      </div>
    )
  },
)

Select.displayName = 'Select'
