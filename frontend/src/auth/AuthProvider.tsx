import { useQueryClient } from '@tanstack/react-query'
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import {
  login as loginRequest,
  logoutRequest,
  refreshAccessToken,
  type LoginCredentials,
} from '@/api/auth'
import {
  setApiAccessToken,
  setApiRefreshHandler,
  setApiUnauthorizedHandler,
} from '@/api/client'
import type { UserRead } from '@/api/types'
import { getCurrentUser, useCurrentUserQuery, userQueryKeys } from '@/api/users'
import { AuthContext, type AuthStatus } from '@/auth/authContext'

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [token, setToken] = useState<string | null>(null)
  const [isRestoring, setIsRestoring] = useState(true)
  const hasToken = token !== null
  const currentUserQuery = useCurrentUserQuery(hasToken)

  useEffect(() => {
    setApiAccessToken(token)
  }, [token])

  const logout = useCallback(() => {
    setApiAccessToken(null)
    setToken(null)
    queryClient.removeQueries({ queryKey: userQueryKeys.all })
    // Best-effort server-side revocation; local session is already cleared.
    void logoutRequest().catch(() => {})
  }, [queryClient])

  useEffect(() => {
    setApiUnauthorizedHandler(logout)
    return () => setApiUnauthorizedHandler(null)
  }, [logout])

  // Exchanges the httpOnly refresh cookie for a new access token. Used both
  // to restore a session on page load and to silently recover from an
  // expired access token on a 401 (see setApiRefreshHandler in client.ts).
  const renewAccessToken = useCallback(async (): Promise<string | null> => {
    try {
      const { access_token } = await refreshAccessToken()
      setApiAccessToken(access_token)
      setToken(access_token)
      return access_token
    } catch {
      setApiAccessToken(null)
      setToken(null)
      return null
    }
  }, [])

  useEffect(() => {
    setApiRefreshHandler(renewAccessToken)
    return () => setApiRefreshHandler(null)
  }, [renewAccessToken])

  const hasBootstrapped = useRef(false)

  useEffect(() => {
    // Guard against StrictMode's dev-only double-invoke of this effect,
    // which would otherwise fire two concurrent /auth/refresh calls on
    // every page load. The ref (unlike a plain flag in the closure)
    // survives StrictMode's simulated mount/unmount/remount, so this still
    // runs exactly once per real mount. The backend independently tolerates
    // genuinely concurrent refresh calls (e.g. from multiple tabs), so this
    // is a noise reduction, not the source of correctness.
    if (hasBootstrapped.current) {
      return
    }
    hasBootstrapped.current = true

    renewAccessToken().finally(() => {
      setIsRestoring(false)
    })
    // Only run once on mount: this bootstraps the session from the refresh
    // cookie, independent of any later token/renewAccessToken changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (currentUserQuery.isError) {
      logout()
    }
  }, [currentUserQuery.isError, logout])

  const login = useCallback(
    async (credentials: LoginCredentials) => {
      const { access_token } = await loginRequest(credentials)
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

  const status: AuthStatus = isRestoring
    ? 'restoring'
    : !hasToken
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
