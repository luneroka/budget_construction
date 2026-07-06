import { useQuery } from '@tanstack/react-query'

import { apiConfig } from './config'
import { apiGet } from './client'
import type { SupplierRead } from './types'

export const supplierQueryKeys = {
  all: ['suppliers'] as const,
  lists: () => [...supplierQueryKeys.all, 'list'] as const,
  list: (includeDeleted = false) =>
    [...supplierQueryKeys.lists(), { includeDeleted }] as const,
}

export function getSuppliers(includeDeleted = false): Promise<SupplierRead[]> {
  return apiGet<SupplierRead[]>('/suppliers/', {
    params: { include_deleted: includeDeleted },
  })
}

export function useSuppliersQuery(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: supplierQueryKeys.list(false),
    queryFn: () => getSuppliers(false),
    enabled: options?.enabled ?? apiConfig.enableReadQueries,
  })
}
