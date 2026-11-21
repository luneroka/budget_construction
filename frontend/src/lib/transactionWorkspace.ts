import type { ProjectTransactionRead } from '@/api/types'
import type { Transaction } from '@/types'
import { transactionToDomain } from '@/lib/apiAdapters'
import { formatCurrency } from '@/lib/format'

export type QuickViewId =
  | 'all'
  | 'unpaid_invoices'
  | 'quotes_to_confirm'
  | 'quotes_to_negotiate'
  | 'quotes_rejected'
  | 'missing_documents'
  | 'recent'

export type TransactionWorkspaceRow = {
  transaction: Transaction
  documentFilenames: string[]
  searchText: string
}

export const recentWindowDays = 30

export const quickViews: Array<{ id: QuickViewId; label: string }> = [
  { id: 'all', label: 'Toutes' },
  { id: 'unpaid_invoices', label: 'Factures impayées' },
  { id: 'quotes_to_negotiate', label: 'Devis à négocier' },
  { id: 'quotes_to_confirm', label: 'Devis en attente' },
  { id: 'quotes_rejected', label: 'Devis rejetés' },
  { id: 'missing_documents', label: 'Documents manquants' },
  { id: 'recent', label: 'Transactions récentes' },
]

// Quick views that stay in the model but are no longer offered as pills, so
// the page steers people to the search bar instead. They are deliberately kept
// in `quickViews` above: `matchesQuickView` still handles them and deep links
// still resolve them, so nothing breaks if one is linked to. Drop an id from
// this set to put its pill back.
//
// `missing_documents` stays visible on purpose -- the dashboard links
// straight to it (`?quick_view=...`), so hiding its pill would land people on
// a filtered table with nothing showing why.
const hiddenQuickViewIds = new Set<QuickViewId>(['recent', 'quotes_rejected'])

export const visibleQuickViews = quickViews.filter(
  (view) => !hiddenQuickViewIds.has(view.id),
)

export const transactionTypeLabels: Record<
  Transaction['transaction_type'],
  string
> = {
  quote: 'Devis',
  invoice: 'Facture',
}

export function getTransactionStatus(transaction: Transaction) {
  return transaction.quote_status ?? transaction.invoice_status
}

// What a transaction is called: its libellé, or else « Devis · Fournisseur »
// / « Facture · Fournisseur », or just its type without a supplier.
export function transactionDisplayTitle(
  transaction: Pick<
    Transaction,
    'title' | 'transaction_type' | 'supplier_name'
  >,
) {
  const title = transaction.title?.trim()
  if (title) return title

  const typeLabel = transactionTypeLabels[transaction.transaction_type]
  return transaction.supplier_name
    ? `${typeLabel} · ${transaction.supplier_name}`
    : typeLabel
}

export function lotLabel(lot: { code: string; designation: string }) {
  return `${lot.code} · ${lot.designation}`
}

function buildSearchText({
  transaction,
  documentFilenames,
}: TransactionWorkspaceRow) {
  return [
    transaction.supplier_name ?? '',
    lotLabel({
      code: transaction.lot_code,
      designation: transaction.lot_designation,
    }),
    transaction.title ?? '',
    transaction.reference ?? '',
    transaction.transaction_type,
    transactionTypeLabels[transaction.transaction_type],
    String(transaction.amount_ttc),
    transaction.amount_ttc.toFixed(2),
    formatCurrency(transaction.amount_ttc),
    ...documentFilenames,
  ]
    .join(' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
}

export function buildTransactionRow(
  transaction: ProjectTransactionRead,
): TransactionWorkspaceRow {
  const row = {
    documentFilenames: transaction.document_original_filenames,
    searchText: '',
    transaction: transactionToDomain(transaction),
  }

  return {
    ...row,
    searchText: buildSearchText(row),
  }
}

function dateAtStart(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate())
}

export function isWithinLastDays(
  value: string,
  days: number,
  now = new Date(),
) {
  const issuedDate = dateAtStart(new Date(`${value}T00:00:00`))
  const today = dateAtStart(now)
  const cutoff = new Date(today)
  cutoff.setDate(today.getDate() - days + 1)

  return issuedDate >= cutoff && issuedDate <= today
}

export function isInCurrentMonth(value: string, now = new Date()) {
  const issuedDate = new Date(`${value}T00:00:00`)

  return (
    issuedDate.getFullYear() === now.getFullYear() &&
    issuedDate.getMonth() === now.getMonth()
  )
}

export function matchesQuickView(
  row: TransactionWorkspaceRow,
  quickView: QuickViewId,
) {
  const { transaction } = row

  if (quickView === 'unpaid_invoices') {
    return (
      transaction.transaction_type === 'invoice' &&
      transaction.invoice_status === 'unpaid'
    )
  }

  if (quickView === 'quotes_to_confirm') {
    return (
      transaction.transaction_type === 'quote' &&
      transaction.quote_status === 'to_confirm'
    )
  }

  if (quickView === 'quotes_to_negotiate') {
    return (
      transaction.transaction_type === 'quote' &&
      transaction.quote_status === 'to_negotiate'
    )
  }

  if (quickView === 'quotes_rejected') {
    return (
      transaction.transaction_type === 'quote' &&
      transaction.quote_status === 'rejected'
    )
  }

  if (quickView === 'missing_documents') {
    return transaction.document_state === 'missing'
  }

  if (quickView === 'recent') {
    return isWithinLastDays(transaction.issued_date, recentWindowDays)
  }

  return true
}
