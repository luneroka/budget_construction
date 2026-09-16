import { useEffect, useState } from 'react'

// The first entry is the default page size.
export const paginationPageSizeOptions = [10, 25, 50, 100]

/**
 * `resetKey` should combine every filter/search value that changes which
 * items appear (but not sort, which only reorders them) — e.g.
 * `${search}|${activeQuickView}`. Changing it snaps back to page 1.
 */
export function usePagination<T>(items: T[], resetKey: string | number) {
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(paginationPageSizeOptions[0])

  useEffect(() => {
    setCurrentPage(1)
  }, [pageSize, resetKey])

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize))
  const currentPageInBounds = Math.min(currentPage, totalPages)
  const pageStart = (currentPageInBounds - 1) * pageSize
  const pageItems = items.slice(pageStart, pageStart + pageSize)

  return {
    pageItems,
    pageSize,
    setPageSize,
    currentPage: currentPageInBounds,
    setCurrentPage,
    totalPages,
    pageStart,
    totalCount: items.length,
  }
}
