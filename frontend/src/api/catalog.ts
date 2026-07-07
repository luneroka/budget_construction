import { useQuery } from '@tanstack/react-query'

import { apiGet } from './client'
import { apiConfig } from './config'
import type { CatalogCategoryRead } from './types'

export const catalogQueryKeys = {
  all: ['catalog'] as const,
  tree: () => [...catalogQueryKeys.all, 'tree'] as const,
}

export function getCatalogTree(): Promise<CatalogCategoryRead[]> {
  return apiGet<CatalogCategoryRead[]>('/catalog/tree')
}

export function useCatalogTreeQuery(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: catalogQueryKeys.tree(),
    queryFn: getCatalogTree,
    enabled: options?.enabled ?? apiConfig.enableReadQueries,
  })
}
