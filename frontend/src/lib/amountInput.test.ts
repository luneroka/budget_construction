import { describe, expect, it } from 'vitest'

import {
  AMOUNT_GROUP_SEPARATOR as S,
  amountFromDisplay,
  formatAmountDisplay,
  isSameAmount,
  reformatAmountInput,
} from './amountInput'

// Where the caret sits, written as a pipe in the string: 'ab|c' is 2.
function typed(withCaret: string) {
  const caret = withCaret.indexOf('|')
  return reformatAmountInput(withCaret.replace('|', ''), caret)
}

function shown({ display, caret }: { display: string; caret: number }) {
  return `${display.slice(0, caret)}|${display.slice(caret)}`
}

describe('reformatAmountInput', () => {
  it('groups thousands as the digits come', () => {
    expect(shown(typed('2100|'))).toBe(`2${S}100|`)
    expect(shown(typed(`2${S}1000|`))).toBe(`21${S}000|`)
  })

  it('keeps the caret after the digit it followed', () => {
    expect(shown(typed(`25|${S}100`))).toBe(`25|${S}100`)
    expect(shown(typed(`1|${S}000`))).toBe(`1|${S}000`)
  })

  it('takes a dot or a comma as the decimal comma, once', () => {
    expect(shown(typed('12.|'))).toBe('12,|')
    expect(shown(typed('12,5,|'))).toBe('12,5|')
  })

  it('stops at two decimals and ten digits', () => {
    expect(shown(typed('1,259|'))).toBe('1,25|')
    expect(typed('123456789012').display).toBe(`1${S}234${S}567${S}890`)
  })

  it('reads a leading comma as « 0, » and drops leading zeros', () => {
    expect(shown(typed(',|'))).toBe('0,|')
    expect(shown(typed('00|7'))).toBe('|7')
    expect(typed('0').display).toBe('0')
  })

  it('ignores anything that is not part of an amount', () => {
    expect(shown(typed('1 234,56 €|'))).toBe(`1${S}234,56|`)
    expect(shown(typed('-12a|'))).toBe('12|')
  })
})

describe('amountFromDisplay', () => {
  it('gives the plain value the form keeps', () => {
    expect(amountFromDisplay(`2${S}100,50`)).toBe('2100.5')
    expect(amountFromDisplay(`2${S}100,`)).toBe('2100')
    expect(amountFromDisplay('0,00')).toBe('0')
    expect(amountFromDisplay('')).toBe('')
  })
})

describe('formatAmountDisplay', () => {
  it('writes the cents out once the field is left', () => {
    expect(formatAmountDisplay('2100', { complete: true })).toBe(`2${S}100,00`)
    expect(formatAmountDisplay('770.5', { complete: true })).toBe('770,50')
    expect(formatAmountDisplay('', { complete: true })).toBe('')
  })

  it('leaves the cents as typed while the field is in use', () => {
    expect(formatAmountDisplay('2100.5', { complete: false })).toBe(
      `2${S}100,5`,
    )
  })
})

describe('isSameAmount', () => {
  it('compares amounts, not how they are written', () => {
    expect(isSameAmount('2100', '2100.00')).toBe(true)
    expect(isSameAmount('', '')).toBe(true)
    expect(isSameAmount('0', '')).toBe(false)
  })
})
