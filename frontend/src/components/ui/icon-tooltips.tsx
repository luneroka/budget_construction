import * as React from 'react'
import { createPortal } from 'react-dom'

import { placeTooltip } from '@/lib/tooltipPosition'

type Tip = { element: HTMLElement; text: string }

const CONTROL_SELECTOR = 'button, a[href], [role="button"]'

function hasVisibleText(element: HTMLElement) {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement
    if (!parent || !node.textContent?.trim()) continue
    // Text for screen readers only, or not rendered at all (a label hidden
    // at this breakpoint), leaves the control showing just its icon.
    if (parent.closest('.sr-only') || parent.getClientRects().length === 0) {
      continue
    }
    return true
  }
  return false
}

// The action of an icon-only control: its aria-label, or failing that the
// screen-reader text inside it. A control with visible text gets nothing.
function iconControlAt(target: EventTarget | null): Tip | null {
  if (!(target instanceof Element)) return null
  const element = target.closest<HTMLElement>(CONTROL_SELECTOR)
  if (!element || hasVisibleText(element)) return null

  const text =
    element.getAttribute('aria-label')?.trim() ||
    Array.from(element.querySelectorAll('.sr-only'))
      .map((node) => node.textContent?.trim())
      .filter(Boolean)
      .join(' ')

  return text ? { element, text } : null
}

/**
 * One tooltip for every icon-only control in the app, mounted once at the
 * root. Point at an icon with the mouse, or reach it with the keyboard, and
 * its action shows at once, with no delay.
 *
 * It reads the control's aria-label, so an icon button needs nothing beyond
 * the label screen readers already require: no wrapper and no `title`, whose
 * native tooltip would come late and double this one. The bubble only
 * repeats that accessible name, so it is hidden from assistive technology
 * rather than read out twice.
 *
 * Touch has no hover: only a mouse pointer or keyboard focus shows it, and a
 * press anywhere hides it, so nothing lingers after a tap or a click.
 */
export function IconTooltips() {
  const [tip, setTip] = React.useState<Tip | null>(null)
  const bubbleRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    function show(next: Tip) {
      setTip((current) =>
        current?.element === next.element && current.text === next.text
          ? current
          : next,
      )
    }

    function hide() {
      setTip(null)
    }

    function onPointerOver(event: PointerEvent) {
      if (event.pointerType !== 'mouse') return
      const next = iconControlAt(event.target)
      if (next) show(next)
    }

    function onPointerOut(event: PointerEvent) {
      const to = event.relatedTarget
      setTip((current) =>
        current && to instanceof Node && current.element.contains(to)
          ? current
          : null,
      )
    }

    function onFocusIn(event: FocusEvent) {
      const target = event.target
      if (!(target instanceof HTMLElement)) return
      // Keyboard focus only: a mouse click also focuses the button, and
      // the tooltip it had just hidden must not come back.
      if (!target.matches(':focus-visible')) return
      const next = iconControlAt(target)
      if (next?.element === target) show(next)
    }

    function onFocusOut(event: FocusEvent) {
      setTip((current) => (current?.element === event.target ? null : current))
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') hide()
    }

    document.addEventListener('pointerover', onPointerOver)
    document.addEventListener('pointerout', onPointerOut)
    document.addEventListener('pointerdown', hide, true)
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('blur', hide)

    return () => {
      document.removeEventListener('pointerover', onPointerOver)
      document.removeEventListener('pointerout', onPointerOut)
      document.removeEventListener('pointerdown', hide, true)
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('blur', hide)
    }
  }, [])

  // Placed before the first paint, then every frame while shown: the icon
  // may scroll, move with an opening accordion, or leave the page.
  React.useLayoutEffect(() => {
    const bubble = bubbleRef.current
    if (!tip || !bubble) return
    const { element } = tip
    let frame = 0

    const place = () => {
      const rect = element.getBoundingClientRect()
      const isGone =
        !element.isConnected ||
        (rect.width === 0 && rect.height === 0) ||
        rect.bottom < 0 ||
        rect.top > window.innerHeight
      if (isGone) {
        setTip(null)
        return
      }

      const { top, left } = placeTooltip(
        rect,
        { width: bubble.offsetWidth, height: bubble.offsetHeight },
        { width: window.innerWidth, height: window.innerHeight },
      )
      bubble.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`
      frame = requestAnimationFrame(place)
    }

    place()
    return () => cancelAnimationFrame(frame)
  }, [tip])

  if (!tip) return null

  return createPortal(
    <div
      ref={bubbleRef}
      aria-hidden="true"
      className="pointer-events-none fixed top-0 left-0 z-[80] max-w-xs rounded-md border border-border bg-card px-2 py-1 text-xs leading-snug text-card-foreground shadow-lg"
    >
      {tip.text}
    </div>,
    document.body,
  )
}
