import {
  Navigate,
  Outlet,
  Route,
  RouterProvider,
  createBrowserRouter,
  createRoutesFromElements,
} from 'react-router-dom'
import { Toaster } from 'react-hot-toast'

import { RedirectAuthenticated } from '@/auth/RedirectAuthenticated'
import { RequireAuth } from '@/auth/RequireAuth'
import { AppLayout } from '@/components/layout/AppLayout'
import { AutoUpdate } from '@/components/layout/AutoUpdate'
import {
  SupplierTransactionsRedirect,
  TransactionsRedirect,
} from '@/components/layout/LegacyRedirects'
import { IconTooltips } from '@/components/ui/icon-tooltips'
import { AdminLotsPage } from '@/pages/AdminLotsPage'
import { AdminUsersPage } from '@/pages/AdminUsersPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { DocumentsPage } from '@/pages/DocumentsPage'
import { ExportsSettingsPage } from '@/pages/ExportsSettingsPage'
import { LoginPage } from '@/pages/LoginPage'
import { LotDetailPage } from '@/pages/LotDetailPage'
import { LotsPage } from '@/pages/LotsPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { ProjectsSettingsPage } from '@/pages/ProjectsSettingsPage'
import { ResetPasswordPage } from '@/pages/ResetPasswordPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { SupplierDetailPage } from '@/pages/SupplierDetailPage'
import { SupplierFormPage } from '@/pages/SupplierFormPage'
import { SuppliersPage } from '@/pages/SuppliersPage'
import { TransactionsPage } from '@/pages/TransactionsPage'
import { TrashPage } from '@/pages/TrashPage'
import { UserSettingsPage } from '@/pages/UserSettingsPage'

// The shell around every route. A data router, so a page with unsaved edits
// (the supplier form) can hold a navigation and ask first.
function RootLayout() {
  return (
    <>
      <AutoUpdate />
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
      <IconTooltips />
      <Outlet />
    </>
  )
}

const router = createBrowserRouter(
  createRoutesFromElements(
    <Route element={<RootLayout />}>
      <Route element={<RedirectAuthenticated />}>
        <Route path="login" element={<LoginPage />} />
      </Route>
      <Route path="auth/reset-password" element={<ResetPasswordPage />} />

      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="lots" element={<LotsPage />} />
          <Route path="lots/:lotId" element={<LotDetailPage />} />
          {/* The page was « Budget » before lots: old bookmarks land here. */}
          <Route path="budget" element={<Navigate to="/lots" replace />} />
          <Route path="devis-factures" element={<TransactionsPage />} />
          {/* « Transactions » before the money-model change. */}
          <Route path="transactions" element={<TransactionsRedirect />} />
          <Route path="suppliers" element={<SuppliersPage />} />
          <Route
            path="suppliers/new"
            element={<SupplierFormPage mode="create" />}
          />
          <Route
            path="suppliers/:supplierId/edit"
            element={<SupplierFormPage mode="edit" />}
          />
          <Route
            path="suppliers/:supplierId"
            element={<SupplierDetailPage tab="summary" />}
          />
          <Route
            path="suppliers/:supplierId/devis-factures"
            element={<SupplierDetailPage tab="transactions" />}
          />
          <Route
            path="suppliers/:supplierId/transactions"
            element={<SupplierTransactionsRedirect />}
          />
          <Route
            path="suppliers/:supplierId/documents"
            element={<SupplierDetailPage tab="documents" />}
          />
          <Route path="documents" element={<DocumentsPage />} />
          <Route path="trash" element={<TrashPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="settings/user" element={<UserSettingsPage />} />
          <Route path="settings/projects" element={<ProjectsSettingsPage />} />
          <Route path="settings/exports" element={<ExportsSettingsPage />} />
          <Route path="settings/users" element={<AdminUsersPage />} />
          <Route path="settings/lots" element={<AdminLotsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Route>,
  ),
)

export default function App() {
  return <RouterProvider router={router} />
}
