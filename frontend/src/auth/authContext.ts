import { createContext, useContext } from 'react'

import type { LoginCredentials } from '@/api/auth'
import type { UserRead } from '@/api/types'

export type AuthStatus = 'restoring' | 'authenticated' | 'unauthenticated'

export type AuthContextValue = {
  user: UserRead | null
  status: AuthStatus
  isAuthenticated: boolean
  login: (credentials: LoginCredentials) => Promise<void>
  logout: () => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth() {
  const value = useContext(AuthContext)

  if (value === null) {
    throw new Error('useAuth must be used inside AuthProvider')
  }

  return value
}
