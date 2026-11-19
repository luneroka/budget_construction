import { useEffect, useId, useRef, useState } from 'react'
import { ChevronDown, Mail } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { mailtoHref, writeAction } from '@/lib/supplierEmail'
import type { EmailRecipient } from '@/lib/supplierEmail'

// « Écrire » on a supplier's page: nothing without an address, the mail
// client straight away with one, a small menu of the contacts with several.
// The menu opens on the arrow keys too, moves with them, and closes on
// Escape (focus back on the button), Tab or a click outside.
export function WriteEmailButton({
  recipients,
}: {
  recipients: EmailRecipient[]
}) {
  const action = writeAction(recipients)
  const [isOpen, setIsOpen] = useState(false)
  const menuId = useId()
  const containerRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const itemRefs = useRef<Array<HTMLAnchorElement | null>>([])
  const focusOnOpen = useRef<'first' | 'last'>('first')

  useEffect(() => {
    if (!isOpen) return
    const items = itemRefs.current.filter(Boolean)
    const target =
      focusOnOpen.current === 'last' ? items[items.length - 1] : items[0]
    target?.focus()

    function closeOnOutsideClick(event: MouseEvent) {
      if (
        event.target instanceof Node &&
        !containerRef.current?.contains(event.target)
      )
        setIsOpen(false)
    }
    document.addEventListener('mousedown', closeOnOutsideClick)
    return () => document.removeEventListener('mousedown', closeOnOutsideClick)
  }, [isOpen])

  if (action.kind === 'hidden') return null

  if (action.kind === 'direct') {
    return (
      <a href={action.href} className={buttonVariants({ variant: 'outline' })}>
        <Mail aria-hidden />
        Écrire
      </a>
    )
  }

  function open(focus: 'first' | 'last') {
    focusOnOpen.current = focus
    setIsOpen(true)
  }

  function close() {
    setIsOpen(false)
    buttonRef.current?.focus()
  }

  function moveFocus(from: number, step: number) {
    const items = itemRefs.current.filter(Boolean)
    const next = (from + step + items.length) % items.length
    items[next]?.focus()
  }

  return (
    <div ref={containerRef} className="relative">
      <Button
        ref={buttonRef}
        variant="outline"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
        onClick={() => (isOpen ? setIsOpen(false) : open('first'))}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            open('first')
          } else if (event.key === 'ArrowUp') {
            event.preventDefault()
            open('last')
          }
        }}
      >
        <Mail aria-hidden />
        Écrire
        <ChevronDown aria-hidden />
      </Button>
      {isOpen ? (
        <div
          id={menuId}
          role="menu"
          aria-label="Écrire à un contact"
          className="absolute right-0 z-30 mt-1 min-w-64 rounded-md border border-border bg-card p-1 shadow-lg"
          onKeyDown={(event) => {
            const index = itemRefs.current.findIndex(
              (item) => item === document.activeElement,
            )
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              moveFocus(index, 1)
            } else if (event.key === 'ArrowUp') {
              event.preventDefault()
              moveFocus(index, -1)
            } else if (event.key === 'Home') {
              event.preventDefault()
              moveFocus(-1, 1)
            } else if (event.key === 'End') {
              event.preventDefault()
              moveFocus(0, -1)
            } else if (event.key === 'Escape') {
              event.preventDefault()
              close()
            } else if (event.key === 'Tab') {
              setIsOpen(false)
            }
          }}
        >
          {action.recipients.map((recipient, index) => (
            <a
              key={recipient.contactId}
              ref={(element) => {
                itemRefs.current[index] = element
              }}
              role="menuitem"
              tabIndex={-1}
              href={mailtoHref(recipient.email)}
              className="block rounded-sm px-3 py-2 text-sm text-foreground hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
              onClick={() => setIsOpen(false)}
            >
              {recipient.label}
            </a>
          ))}
        </div>
      ) : null}
    </div>
  )
}
