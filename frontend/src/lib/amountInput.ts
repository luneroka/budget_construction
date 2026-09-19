// Typing an amount the French way: « 2 100,50 ». What the field shows is
// grouped by thousands with a decimal comma; what the form keeps is the plain
// value ("2100.5") that the maths and the API read. No React in here so the
// caret arithmetic can be unit-tested directly.

// The narrow no-break space Intl's fr-FR grouping uses, so a typed amount
// groups exactly like the amounts printed elsewhere in the app.
export const AMOUNT_GROUP_SEPARATOR = ' '

// Numeric(12, 2) in the database: ten digits before the comma, two after.
const MAX_INTEGER_DIGITS = 10
const MAX_DECIMALS = 2

function groupThousands(integerDigits: string) {
  return integerDigits.replace(/\B(?=(\d{3})+(?!\d))/g, AMOUNT_GROUP_SEPARATOR)
}

function isSignificant(char: string) {
  return (char >= '0' && char <= '9') || char === ','
}

// Cleans what the field holds after a keystroke or a paste and says where the
// caret goes. Digits are kept, the first comma or dot becomes the decimal
// comma, anything else is dropped; the caret stays after the same digit it
// followed, however many spaces moved around it.
export function reformatAmountInput(
  raw: string,
  caret: number,
): { display: string; caret: number } {
  let integerDigits = ''
  let decimals = ''
  let hasSeparator = false
  let keptBeforeCaret = 0

  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index]
    let isKept = false

    if (char >= '0' && char <= '9') {
      if (hasSeparator) {
        if (decimals.length < MAX_DECIMALS) {
          decimals += char
          isKept = true
        }
      } else if (integerDigits.length < MAX_INTEGER_DIGITS) {
        integerDigits += char
        isKept = true
      }
    } else if ((char === ',' || char === '.') && !hasSeparator) {
      hasSeparator = true
      isKept = true
    }

    if (isKept && index < caret) keptBeforeCaret += 1
  }

  // "007" is 7; a lone zero stays.
  const trimmedDigits = integerDigits.replace(/^0+(?=\d)/, '')
  const removedZeros = integerDigits.length - trimmedDigits.length
  keptBeforeCaret -= Math.min(keptBeforeCaret, removedZeros)
  integerDigits = trimmedDigits

  // A comma typed first reads « 0, ».
  if (integerDigits === '' && hasSeparator) {
    integerDigits = '0'
    if (keptBeforeCaret > 0) keptBeforeCaret += 1
  }

  const display =
    groupThousands(integerDigits) + (hasSeparator ? `,${decimals}` : '')

  let position = 0
  let seen = 0
  while (position < display.length && seen < keptBeforeCaret) {
    if (isSignificant(display[position])) seen += 1
    position += 1
  }

  return { display, caret: position }
}

// The plain value behind what the field shows: « 2 100,50 » is "2100.5".
export function amountFromDisplay(display: string) {
  const plain = reformatAmountInput(display, 0)
    .display.replaceAll(AMOUNT_GROUP_SEPARATOR, '')
    .replace(',', '.')

  return plain === '' ? '' : String(Number(plain))
}

// How a plain value shows in the field. `complete` writes the cents out
// (« 2 100,00 »), for a field that is not being typed in.
export function formatAmountDisplay(
  value: string,
  { complete }: { complete: boolean },
) {
  const trimmed = value.trim()
  if (trimmed === '') return ''

  const amount = Number(trimmed)
  if (!complete || !Number.isFinite(amount)) {
    return reformatAmountInput(trimmed, trimmed.length).display
  }

  const [integerDigits, decimals] = amount.toFixed(MAX_DECIMALS).split('.')
  return `${groupThousands(integerDigits)},${decimals}`
}

export function isSameAmount(left: string, right: string) {
  if (left.trim() === '' || right.trim() === '') {
    return left.trim() === right.trim()
  }

  return Number(left) === Number(right)
}
