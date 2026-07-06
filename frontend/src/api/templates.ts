import { useQuery } from '@tanstack/react-query'

import { apiGet } from './client'
import { apiConfig } from './config'
import type { TemplateRead } from './types'

export const templateQueryKeys = {
  all: ['templates'] as const,
  lists: () => [...templateQueryKeys.all, 'list'] as const,
  list: (includeInactive = false) =>
    [...templateQueryKeys.lists(), { includeInactive }] as const,
}

export function getTemplates(includeInactive = false): Promise<TemplateRead[]> {
  return apiGet<TemplateRead[]>('/templates/', {
    params: { include_inactive: includeInactive },
  })
}

export function useTemplatesQuery(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: templateQueryKeys.list(false),
    queryFn: () => getTemplates(false),
    enabled: options?.enabled ?? apiConfig.enableReadQueries,
  })
}
