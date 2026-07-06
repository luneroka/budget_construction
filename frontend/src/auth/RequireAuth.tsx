import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { useAuth } from '@/auth/authContext'

export function RequireAuth() {
  const location = useLocation()
  const { isAuthenticated, status } = useAuth()

  if (status === 'restoring') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6 text-sm text-muted-foreground">
        Chargement de la session...
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  return <Outlet />
}
