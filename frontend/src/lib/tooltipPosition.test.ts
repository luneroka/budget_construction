import { describe, expect, it } from 'vitest'

import { placeTooltip } from './tooltipPosition'

const viewport = { width: 1000, height: 800 }
const tooltip = { width: 80, height: 20 }
const icon = (top: number, left: number) => ({
  top,
  left,
  width: 24,
  height: 24,
})

describe('placeTooltip', () => {
  it('centres the tooltip above the icon', () => {
    expect(placeTooltip(icon(100, 100), tooltip, viewport)).toEqual({
      top: 74,
      left: 72,
    })
  })

  it('drops below the icon when there is no room above', () => {
    expect(placeTooltip(icon(10, 100), tooltip, viewport).top).toBe(40)
  })

  it('stays inside the window at either edge', () => {
    expect(placeTooltip(icon(100, 990), tooltip, viewport).left).toBe(912)
    expect(placeTooltip(icon(100, 0), tooltip, viewport).left).toBe(8)
  })
})
