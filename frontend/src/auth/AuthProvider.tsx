import { useQueryClient } from '@tanstack/react-query'
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'

import { login as loginRequest, type LoginCredentials } from '@/api/auth'
import {
  setApiAccessToken,
  setApiUnauthorizedHandler,
} from '@/api/client'
import type { UserRead } from '@/api/types'
import { getCurrentUser, useCurrentUserQuery, userQueryKeys } from '@/api/users'
import { AuthContext, type AuthStatus } from '@/auth/authContext'
import {
  clearStoredAccessToken,
  getStoredAccessToken,
  storeAccessToken,
} from '@/auth/tokenStorage'

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [token, setToken] = useState(() => {
    const storedToken = getStoredAccessToken()
    setApiAccessToken(storedToken)
    return storedToken
  })
  const hasToken = token !== null
  const currentUserQuery = useCurrentUserQuery(hasToken)

  useEffect(() => {
    setApiAccessToken(token)
  }, [token])

  const logout = useCallback(() => {
    clearStoredAccessToken()
    setApiAccessToken(null)
    setToken(null)
    queryClient.removeQueries({ queryKey: userQueryKeys.all })
  }, [queryClient])

  useEffect(() => {
    setApiUnauthorizedHandler(logout)
    return () => setApiUnauthorizedHandler(null)
  }, [logout])

  useEffect(() => {
    if (currentUserQuery.isError) {
      logout()
    }
  }, [currentUserQuery.isError, logout])

  const login = useCallback(
    async (credentials: LoginCredentials) => {
      const { access_token } = await loginRequest(credentials)
      storeAccessToken(access_token)
      setApiAccessToken(access_token)
      setToken(access_token)

      const user = await queryClient.fetchQuery({
        queryKey: userQueryKeys.current(),
        queryFn: getCurrentUser,
        staleTime: 60_000,
      })

      queryClient.setQueryData<UserRead>(userQueryKeys.current(), user)
    },
    [queryClient],
  )

  const status: AuthStatus = !hasToken
    ? 'unauthenticated'
    : currentUserQuery.data
      ? 'authenticated'
      : currentUserQuery.isLoading || currentUserQuery.isFetching
      ? 'restoring'
      : 'unauthenticated'

  const value = useMemo(
    () => ({
      user: currentUserQuery.data ?? null,
      status,
      isAuthenticated: status === 'authenticated',
      login,
      logout,
    }),
    [currentUserQuery.data, login, logout, status],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
