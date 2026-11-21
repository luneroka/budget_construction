import { Navigate, useLocation, useParams } from 'react-router-dom'

import {
  quotesAndInvoicesRedirect,
  supplierQuotesAndInvoicesRedirect,
} from '@/lib/legacyRoutes'

// The old « Transactions » URLs, replaced in the history (not pushed).
export function TransactionsRedirect() {
  const location = useLocation()
  return <Navigate to={quotesAndInvoicesRedirect(location)} replace />
}

export function SupplierTransactionsRedirect() {
  const location = useLocation()
  const { supplierId } = useParams<{ supplierId: string }>()
  return (
    <Navigate
      to={supplierQuotesAndInvoicesRedirect(supplierId, location)}
      replace
    />
  )
}
