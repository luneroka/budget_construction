import type { ReactNode } from 'react'

export function normalizeSearchText(value: string) {
  return normalizeSearchFragment(value).trim()
}

function normalizeSearchFragment(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
}

function buildSearchIndex(value: string) {
  let normalized = ''
  const originalRanges: Array<{ start: number; end: number }> = []

  for (let index = 0; index < value.length;) {
    const codePoint = value.codePointAt(index)
    if (codePoint === undefined) break

    const char = String.fromCodePoint(codePoint)
    const end = index + char.length
    const normalizedChar = normalizeSearchFragment(char)

    for (let offset = 0; offset < normalizedChar.length; offset += 1) {
      originalRanges.push({ start: index, end })
    }
    normalized += normalizedChar
    index = end
  }

  return { normalized, originalRanges }
}

function getHighlightRanges(value: string, query: string) {
  const normalizedQuery = normalizeSearchText(query)
  if (!normalizedQuery) return []

  const { normalized, originalRanges } = buildSearchIndex(value)
  const ranges: Array<{ start: number; end: number }> = []
  let searchFrom = 0

  while (searchFrom < normalized.length) {
    const matchIndex = normalized.indexOf(normalizedQuery, searchFrom)
    if (matchIndex === -1) break

    const matchEnd = matchIndex + normalizedQuery.length - 1
    const start = originalRanges[matchIndex]?.start
    const end = originalRanges[matchEnd]?.end

    if (start !== undefined && end !== undefined) {
      const previousRange = ranges.at(-1)
      if (previousRange && start <= previousRange.end) {
        previousRange.end = Math.max(previousRange.end, end)
      } else {
        ranges.push({ start, end })
      }
    }

    searchFrom = matchIndex + normalizedQuery.length
  }

  return ranges
}

export function highlightSearchMatches(
  value: string,
  query: string,
): ReactNode {
  const ranges = getHighlightRanges(value, query)
  if (ranges.length === 0) return value

  const parts: ReactNode[] = []
  let cursor = 0

  ranges.forEach((range, index) => {
    if (cursor < range.start) {
      parts.push(value.slice(cursor, range.start))
    }

    parts.push(
      <mark
        key={`${range.start}-${range.end}-${index}`}
        className="rounded-sm bg-gold/20 px-0.5 text-inherit"
      >
        {value.slice(range.start, range.end)}
      </mark>,
    )
    cursor = range.end
  })

  if (cursor < value.length) {
    parts.push(value.slice(cursor))
  }

  return parts
}
