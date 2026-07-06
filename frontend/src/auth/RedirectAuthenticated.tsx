import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { useAuth } from '@/auth/authContext'

type LocationState = {
  from?: {
    pathname?: string
    search?: string
    hash?: string
  }
}

export function RedirectAuthenticated() {
  const location = useLocation()
  const { isAuthenticated, status } = useAuth()
  const state = location.state as LocationState | null
  const target = state?.from
    ? `${state.from.pathname ?? '/dashboard'}${state.from.search ?? ''}${
        state.from.hash ?? ''
      }`
    : '/dashboard'

  if (status === 'restoring') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6 text-sm text-muted-foreground">
        Chargement de la session...
      </div>
    )
  }

  if (isAuthenticated) {
    return <Navigate to={target} replace />
  }

  return <Outlet />
}
