import type { ReactNode } from 'react'

import { Input } from '@/components/ui/input'

type TableToolbarProps = {
  searchValue?: string
  searchPlaceholder?: string
  onSearchChange?: (value: string) => void
  actions?: ReactNode
}

export function TableToolbar({
  searchValue = '',
  searchPlaceholder = 'Rechercher',
  onSearchChange,
  actions,
}: TableToolbarProps) {
  return (
    <div className="flex flex-col gap-3 border-b border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
      <Input
        value={searchValue}
        placeholder={searchPlaceholder}
        onChange={(event) => onSearchChange?.(event.target.value)}
        className="max-w-sm"
      />
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  )
}
