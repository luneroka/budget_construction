import { QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

import { queryClient } from '@/api/queryClient'
import { AuthProvider } from '@/auth/AuthProvider'
import { AppStateProvider } from '@/state/AppStateProvider'

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppStateProvider>{children}</AppStateProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}
