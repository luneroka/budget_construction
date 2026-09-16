import { Button } from '@/components/ui/button'

export function PaginationFooter({
  pageStart,
  pageSize,
  totalCount,
  currentPage,
  totalPages,
  onPageChange,
}: {
  pageStart: number
  pageSize: number
  totalCount: number
  currentPage: number
  totalPages: number
  onPageChange: (page: number) => void
}) {
  if (totalCount <= pageSize) return null

  return (
    <div className="flex flex-col gap-3 border-t border-border px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
      <span>
        {pageStart + 1}-{Math.min(pageStart + pageSize, totalCount)} sur{' '}
        {totalCount}
      </span>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
        >
          Précédent
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
        >
          Suivant
        </Button>
      </div>
    </div>
  )
}
