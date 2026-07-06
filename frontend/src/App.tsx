import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { RedirectAuthenticated } from '@/auth/RedirectAuthenticated'
import { RequireAuth } from '@/auth/RequireAuth'
import { AppLayout } from '@/components/layout/AppLayout'
import { BudgetPage } from '@/pages/BudgetPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { DocumentsPage } from '@/pages/DocumentsPage'
import { LoginPage } from '@/pages/LoginPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { ProjectsSettingsPage, SettingsPage } from '@/pages/SettingsPage'
import { SuppliersPage } from '@/pages/SuppliersPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<RedirectAuthenticated />}>
          <Route path="login" element={<LoginPage />} />
        </Route>

        <Route element={<RequireAuth />}>
          <Route element={<AppLayout />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="budget" element={<BudgetPage />} />
            <Route path="suppliers" element={<SuppliersPage />} />
            <Route path="documents" element={<DocumentsPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route
              path="settings/projects"
              element={<ProjectsSettingsPage />}
            />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
