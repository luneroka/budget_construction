import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'

import { RedirectAuthenticated } from '@/auth/RedirectAuthenticated'
import { RequireAuth } from '@/auth/RequireAuth'
import { AppLayout } from '@/components/layout/AppLayout'
import { BudgetPage } from '@/pages/BudgetPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { DocumentsPage } from '@/pages/DocumentsPage'
import { ExportsSettingsPage } from '@/pages/ExportsSettingsPage'
import { LoginPage } from '@/pages/LoginPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { ProjectsSettingsPage } from '@/pages/ProjectsSettingsPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { SuppliersPage } from '@/pages/SuppliersPage'
import { TransactionsPage } from '@/pages/TransactionsPage'
import { TrashPage } from '@/pages/TrashPage'

export default function App() {
  return (
    <BrowserRouter>
      <Toaster
        position="top-center"
        toastOptions={{
          duration: 3000,
          style: {
            background: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            borderRadius: 'var(--radius)',
            color: 'hsl(var(--card-foreground))',
            boxShadow:
              '0 10px 15px -3px rgb(15 23 42 / 0.12), 0 4px 6px -4px rgb(15 23 42 / 0.12)',
            fontSize: '0.875rem',
          },
          success: {
            iconTheme: {
              primary: 'hsl(var(--success))',
              secondary: 'hsl(var(--success-foreground))',
            },
          },
          error: {
            iconTheme: {
              primary: 'hsl(var(--destructive))',
              secondary: 'hsl(var(--destructive-foreground))',
            },
          },
        }}
      />
      <Routes>
        <Route element={<RedirectAuthenticated />}>
          <Route path="login" element={<LoginPage />} />
        </Route>

        <Route element={<RequireAuth />}>
          <Route element={<AppLayout />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="budget" element={<BudgetPage />} />
            <Route path="transactions" element={<TransactionsPage />} />
            <Route path="suppliers" element={<SuppliersPage />} />
            <Route path="documents" element={<DocumentsPage />} />
            <Route path="trash" element={<TrashPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route
              path="settings/projects"
              element={<ProjectsSettingsPage />}
            />
            <Route path="settings/exports" element={<ExportsSettingsPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
