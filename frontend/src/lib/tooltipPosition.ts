// Where a tooltip goes: centred above what it describes, below when there is
// no room above, and always inside the window. No DOM in here so the
// geometry can be unit-tested directly.

type Box = { top: number; left: number; width: number; height: number }
type Size = { width: number; height: number }

const GAP = 6
const MARGIN = 8

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, Math.max(min, max)))
}

export function placeTooltip(anchor: Box, tooltip: Size, viewport: Size) {
  const above = anchor.top - GAP - tooltip.height
  const top = above >= MARGIN ? above : anchor.top + anchor.height + GAP
  const left = anchor.left + anchor.width / 2 - tooltip.width / 2

  return {
    top: clamp(top, MARGIN, viewport.height - MARGIN - tooltip.height),
    left: clamp(left, MARGIN, viewport.width - MARGIN - tooltip.width),
  }
}
