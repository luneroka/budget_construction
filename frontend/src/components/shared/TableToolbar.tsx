import type { ReactNode } from 'react'

import { Input } from '@/components/ui/input'

type TableToolbarProps = {
  searchValue?: string
  searchPlaceholder?: string
  onSearchChange?: (value: string) => void
  actions?: ReactNode
  /** Shown before the search bar, such as a filter that scopes the search. */
  leading?: ReactNode
}

export function TableToolbar({
  searchValue = '',
  searchPlaceholder = 'Rechercher',
  onSearchChange,
  actions,
  leading,
}: TableToolbarProps) {
  return (
    <div className="flex flex-col gap-3 border-b border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center">
        {leading}
        <Input
          value={searchValue}
          placeholder={searchPlaceholder}
          onChange={(event) => onSearchChange?.(event.target.value)}
          className="max-w-sm"
        />
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  )
}
