import { useQuery } from '@tanstack/react-query'

import { apiGet } from './client'
import type { UserRead } from './types'

export const userQueryKeys = {
  all: ['users'] as const,
  current: () => [...userQueryKeys.all, 'me'] as const,
}

export function getCurrentUser(): Promise<UserRead> {
  return apiGet<UserRead>('/users/me')
}

export function useCurrentUserQuery(enabled: boolean) {
  return useQuery({
    queryKey: userQueryKeys.current(),
    queryFn: getCurrentUser,
    enabled,
    retry: false,
    staleTime: 60_000,
  })
}
