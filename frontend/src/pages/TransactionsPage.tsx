import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Eye,
  FileText,
  Files,
  Trash2,
} from 'lucide-react'

import { getApiErrorMessage } from '@/api/client'
import { useProjectQuery } from '@/api/projects'
import { useSuppliersQuery } from '@/api/suppliers'
import { useProjectTransactionsQuery } from '@/api/transactions'
import { DeleteTransactionDialog } from '@/components/budget/DeleteTransactionDialog'
import type {
  TransactionDeleteState,
  TransactionReviewState,
} from '@/components/budget/types'
import {
  TransactionReviewModal,
  type ViewedTransactionContext,
} from '@/components/budget/TransactionModal'
import { DocumentViewerDialog } from '@/components/shared/DocumentViewerDialog'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { PaginationFooter } from '@/components/shared/PaginationFooter'
import { TableToolbar } from '@/components/shared/TableToolbar'
import {
  paginationPageSizeOptions,
  usePagination,
} from '@/components/shared/usePagination'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { projectToDomain, suppliersToDomain } from '@/lib/apiAdapters'
import { canToggleBudgetSelection } from '@/lib/budgetDomain'
import {
  buildTransactionRow,
  getBudgetLabel,
  getTransactionStatus,
  isInCurrentMonth,
  isWithinLastDays,
  matchesQuickView,
  quickViews,
  transactionTypeLabels,
  type QuickViewId,
  type TransactionWorkspaceRow,
  visibleQuickViews,
} from '@/lib/transactionWorkspace'
import {
  formatDocumentPositionLabel,
  formatOriginalFilename,
} from '@/lib/documents'
import { formatCurrency, formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { notifyError } from '@/lib/toasts'
import { useSelectedProjectId } from '@/state/appState'
import { useTransactionDocumentViewer } from '@/hooks/useTransactionDocumentViewer'

type TransactionTypeFilter =
  'all' | TransactionWorkspaceRow['transaction']['transaction_type']
type DateFilter = 'all' | 'last_7_days' | 'last_30_days' | 'current_month'
type SortField = 'date' | 'amount'
type SortDirection = 'asc' | 'desc'

type SortState = {
  field: SortField
  direction: SortDirection
}

function isQuickViewId(value: string | null): value is QuickViewId {
  return quickViews.some((view) => view.id === value)
}

function matchesDateFilter(row: TransactionWorkspaceRow, filter: DateFilter) {
  if (filter === 'last_7_days') {
    return isWithinLastDays(row.transaction.issued_date, 7)
  }

  if (filter === 'last_30_days') {
    return isWithinLastDays(row.transaction.issued_date, 30)
  }

  if (filter === 'current_month') {
    return isInCurrentMonth(row.transaction.issued_date)
  }

  return true
}

function sortTransactions(
  rows: TransactionWorkspaceRow[],
  sort: SortState,
): TransactionWorkspaceRow[] {
  const direction = sort.direction === 'asc' ? 1 : -1

  return [...rows].sort((left, right) => {
    if (sort.field === 'amount') {
      const amountSort =
        (left.transaction.amount_ttc - right.transaction.amount_ttc) * direction
      if (amountSort !== 0) return amountSort
    } else {
      const dateSort =
        left.transaction.issued_date.localeCompare(
          right.transaction.issued_date,
        ) * direction
      if (dateSort !== 0) return dateSort
    }

    return (Number(left.transaction.id) - Number(right.transaction.id)) * -1
  })
}

function TransactionTableMessage({
  colSpan,
  className,
  message,
}: {
  colSpan: number
  className?: string
  message: string
}) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className={className}>
        {message}
      </TableCell>
    </TableRow>
  )
}

function SortableHeader({
  align = 'left',
  children,
  field,
  sort,
  onSort,
}: {
  align?: 'left' | 'right'
  children: string
  field: SortField
  sort: SortState
  onSort: (field: SortField) => void
}) {
  const isActive = sort.field === field
  const Icon = !isActive
    ? ArrowUpDown
    : sort.direction === 'asc'
      ? ArrowUp
      : ArrowDown

  return (
    <TableHead
      className={cn('whitespace-nowrap', align === 'right' && 'text-right')}
    >
      <button
        type="button"
        className={cn(
          'inline-flex items-center gap-1.5 rounded-sm text-left font-semibold text-foreground transition-colors hover:text-gold',
          align === 'right' && 'justify-end',
        )}
        onClick={() => onSort(field)}
      >
        {children}
        <Icon className="h-3.5 w-3.5" aria-hidden />
      </button>
    </TableHead>
  )
}

export function TransactionsPage() {
  const projectId = useSelectedProjectId()
  const [searchParams, setSearchParams] = useSearchParams()
  const quickViewParam = searchParams.get('quick_view')
  const projectQuery = useProjectQuery(projectId)
  const transactionsQuery = useProjectTransactionsQuery(projectId)
  const suppliersQuery = useSuppliersQuery({ enabled: projectId !== null })
  const project = useMemo(
    () => (projectQuery.data ? projectToDomain(projectQuery.data) : null),
    [projectQuery.data],
  )
  const [activeQuickView, setActiveQuickView] = useState<QuickViewId>(() =>
    isQuickViewId(quickViewParam) ? quickViewParam : 'all',
  )
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<TransactionTypeFilter>('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [supplierFilter, setSupplierFilter] = useState('all')
  const [dateFilter, setDateFilter] = useState<DateFilter>('all')

  // The Type / Catégorie / Fournisseur / Date selects are hidden for now to
  // steer people to the search bar, but the row is kept in the tree rather than
  // deleted: flip this to true to get it back exactly as it was. The filter
  // state above stays at 'all' while hidden, so results are unaffected. The
  // annotation is load-bearing -- without it TS narrows the flag to `false`,
  // marks the JSX unreachable and `noUnusedLocals` then fails on the setters.
  const showSecondaryFilters: boolean = false
  const [sort, setSort] = useState<SortState>({
    field: 'date',
    direction: 'desc',
  })
  const [transactionReview, setTransactionReview] =
    useState<TransactionReviewState | null>(null)
  const [transactionDelete, setTransactionDelete] =
    useState<TransactionDeleteState | null>(null)
  const documentViewer = useTransactionDocumentViewer()
  const [openingDocumentsTransactionId, setOpeningDocumentsTransactionId] =
    useState<string | null>(null)
  const suppliers = useMemo(
    () => suppliersToDomain(suppliersQuery.data),
    [suppliersQuery.data],
  )
  const transactionRows = useMemo(
    () => (transactionsQuery.data ?? []).map(buildTransactionRow),
    [transactionsQuery.data],
  )
  const normalizedSearch = search.trim().toLocaleLowerCase()
  const secondaryFilteredRows = useMemo(
    () =>
      transactionRows.filter((row) => {
        if (normalizedSearch && !row.searchText.includes(normalizedSearch)) {
          return false
        }

        if (
          typeFilter !== 'all' &&
          row.transaction.transaction_type !== typeFilter
        ) {
          return false
        }

        if (
          categoryFilter !== 'all' &&
          row.product.category_name !== categoryFilter
        ) {
          return false
        }

        if (supplierFilter === 'none' && row.transaction.supplier_id !== null) {
          return false
        }

        if (
          supplierFilter !== 'all' &&
          supplierFilter !== 'none' &&
          row.transaction.supplier_id !== supplierFilter
        ) {
          return false
        }

        return matchesDateFilter(row, dateFilter)
      }),
    [
      categoryFilter,
      dateFilter,
      normalizedSearch,
      supplierFilter,
      transactionRows,
      typeFilter,
    ],
  )
  const quickViewCounts = useMemo(
    () =>
      Object.fromEntries(
        quickViews.map((view) => [
          view.id,
          secondaryFilteredRows.filter((row) => matchesQuickView(row, view.id))
            .length,
        ]),
      ) as Record<QuickViewId, number>,
    [secondaryFilteredRows],
  )
  const filteredRows = useMemo(
    () =>
      secondaryFilteredRows.filter((row) =>
        matchesQuickView(row, activeQuickView),
      ),
    [activeQuickView, secondaryFilteredRows],
  )
  const sortedRows = useMemo(
    () => sortTransactions(filteredRows, sort),
    [filteredRows, sort],
  )
  const categoryOptions = useMemo(
    () =>
      [...new Set(transactionRows.map((row) => row.product.category_name))]
        .filter(Boolean)
        .sort((left, right) => left.localeCompare(right, 'fr')),
    [transactionRows],
  )
  const supplierOptions = useMemo(() => {
    const options = new Map<string, string>()
    let hasNoSupplier = false

    transactionRows.forEach((row) => {
      if (row.transaction.supplier_id === null) {
        hasNoSupplier = true
      } else {
        options.set(
          row.transaction.supplier_id,
          row.transaction.supplier_name ?? 'Fournisseur',
        )
      }
    })

    return {
      hasNoSupplier,
      suppliers: [...options.entries()].sort((left, right) =>
        left[1].localeCompare(right[1], 'fr'),
      ),
    }
  }, [transactionRows])

  useEffect(() => {
    const nextQuickView = isQuickViewId(quickViewParam) ? quickViewParam : 'all'

    if (nextQuickView !== activeQuickView) {
      setActiveQuickView(nextQuickView)
    }
  }, [activeQuickView, quickViewParam])

  function selectQuickView(quickView: QuickViewId) {
    setActiveQuickView(quickView)
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      if (quickView === 'all') {
        next.delete('quick_view')
      } else {
        next.set('quick_view', quickView)
      }
      return next
    })
  }

  const {
    pageItems: paginatedRows,
    pageSize,
    setPageSize,
    currentPage,
    setCurrentPage,
    totalPages,
    pageStart,
    totalCount,
  } = usePagination(
    sortedRows,
    `${activeQuickView}|${categoryFilter}|${dateFilter}|${normalizedSearch}|${projectId}|${supplierFilter}|${typeFilter}`,
  )
  const pageError =
    projectQuery.error ??
    transactionsQuery.error ??
    suppliersQuery.error ??
    null
  const isLoading =
    projectQuery.isLoading ||
    transactionsQuery.isLoading ||
    suppliersQuery.isLoading
  const isRefreshing =
    !isLoading &&
    !pageError &&
    (projectQuery.isFetching ||
      transactionsQuery.isFetching ||
      suppliersQuery.isFetching)
  const transactionCountLabel = `${sortedRows.length} transaction${
    sortedRows.length > 1 ? 's' : ''
  }`

  function retryQueries() {
    void projectQuery.refetch()
    void transactionsQuery.refetch()
    void suppliersQuery.refetch()
  }

  function updateSort(field: SortField) {
    setSort((current) => {
      if (current.field !== field) {
        return { field, direction: 'desc' }
      }

      return {
        field,
        direction: current.direction === 'asc' ? 'desc' : 'asc',
      }
    })
  }

  function formatTransactionContextLabel(context: ViewedTransactionContext) {
    const typeLabel =
      transactionTypeLabels[context.transaction.transaction_type]
    return [
      typeLabel,
      context.product.category_name,
      context.transaction.supplier_name,
      formatCurrency(context.transaction.amount_ttc),
    ]
      .filter(Boolean)
      .join(' • ')
  }

  async function openTransactionDocumentsViewer(
    context: ViewedTransactionContext,
  ) {
    const transactionId = Number(context.transaction.id)
    if (!Number.isInteger(transactionId)) {
      notifyError('Identifiant de transaction invalide.')
      return
    }

    setOpeningDocumentsTransactionId(context.transaction.id)
    await documentViewer.open(
      transactionId,
      formatTransactionContextLabel(context),
    )
    setOpeningDocumentsTransactionId(null)
  }

  function renderTableBody() {
    if (isLoading) {
      return (
        <TransactionTableMessage
          colSpan={8}
          className="py-8 text-center text-muted-foreground"
          message="Chargement des transactions..."
        />
      )
    }

    if (pageError) {
      return (
        <TransactionTableMessage
          colSpan={8}
          className="py-8 text-center text-destructive"
          message="Impossible de charger les transactions."
        />
      )
    }

    if (paginatedRows.length === 0) {
      return (
        <TransactionTableMessage
          colSpan={8}
          className="py-8 text-center text-muted-foreground"
          message={
            search.trim()
              ? 'Aucune transaction ne correspond à la recherche.'
              : 'Aucune transaction enregistrée.'
          }
        />
      )
    }

    return paginatedRows.map(({ budgetLine, product, transaction }) => {
      const status = getTransactionStatus(transaction)
      const context = { budgetLine, product, transaction }

      return (
        <TableRow key={transaction.id}>
          <TableCell className="whitespace-nowrap">
            {formatDate(transaction.issued_date)}
          </TableCell>
          <TableCell className="whitespace-nowrap">
            <StatusBadge status={transaction.transaction_type} />
          </TableCell>
          <TableCell className="min-w-40 font-medium">
            {transaction.supplier_name}
          </TableCell>
          <TableCell className="min-w-44">{product.category_name}</TableCell>
          <TableCell className="min-w-44">
            {getBudgetLabel(product, budgetLine)}
          </TableCell>
          <TableCell className="whitespace-nowrap text-right font-medium">
            {formatCurrency(transaction.amount_ttc)}
          </TableCell>
          <TableCell className="whitespace-nowrap">
            {status ? <StatusBadge status={status} /> : null}
          </TableCell>
          <TableCell className="whitespace-nowrap text-right">
            {/* Right-aligned so the rail keeps its position whether or not the
                documents icon is there, matching the budget page's inline
                table. */}
            <div className="inline-flex justify-end gap-1">
              {transaction.document_state === 'attached' ? (
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={
                    transaction.document_count > 1
                      ? 'Voir les documents'
                      : 'Voir le document'
                  }
                  disabled={openingDocumentsTransactionId === transaction.id}
                  onClick={() => void openTransactionDocumentsViewer(context)}
                >
                  {transaction.document_count > 1 ? (
                    <Files aria-hidden />
                  ) : (
                    <FileText aria-hidden />
                  )}
                </Button>
              ) : null}
              <Button
                size="icon"
                variant="ghost"
                aria-label="Voir la transaction"
                onClick={() => setTransactionReview({ context })}
              >
                <Eye aria-hidden />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Supprimer la transaction"
                onClick={() => setTransactionDelete(context)}
              >
                <Trash2 aria-hidden />
              </Button>
            </div>
          </TableCell>
        </TableRow>
      )
    })
  }

  if (!projectId) {
    return (
      <section>
        <PageHeader
          title="Transactions"
          description="Sélectionnez un projet pour consulter ses transactions."
        />
        <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
          Aucun projet actif.
        </div>
      </section>
    )
  }

  return (
    <section>
      <PageHeader
        title="Transactions"
        description="Vue chronologique de toutes les transactions du projet."
      />

      <div className="mt-4 flex flex-wrap gap-1.5">
        {visibleQuickViews.map((view) => {
          const isActive = activeQuickView === view.id

          return (
            <Button
              key={view.id}
              variant={isActive ? 'gold' : 'outline'}
              onClick={() => selectQuickView(view.id)}
            >
              {view.label}
              <Badge variant={isActive ? 'default' : 'muted'}>
                {quickViewCounts[view.id] ?? 0}
              </Badge>
            </Button>
          )
        })}
      </div>

      {showSecondaryFilters ? (
        <div className="mt-2 grid gap-2 bg-muted/15 py-2 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <label
              className="text-xs font-medium text-muted-foreground"
              htmlFor="transactions-type-filter"
            >
              Type
            </label>
            <Select
              id="transactions-type-filter"
              value={typeFilter}
              onChange={(event) =>
                setTypeFilter(event.target.value as TransactionTypeFilter)
              }
            >
              <option value="all">Tous les types</option>
              {Object.entries(transactionTypeLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1">
            <label
              className="text-xs font-medium text-muted-foreground"
              htmlFor="transactions-category-filter"
            >
              Catégorie
            </label>
            <Select
              id="transactions-category-filter"
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
            >
              <option value="all">Toutes les catégories</option>
              {categoryOptions.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1">
            <label
              className="text-xs font-medium text-muted-foreground"
              htmlFor="transactions-supplier-filter"
            >
              Fournisseur
            </label>
            <Select
              id="transactions-supplier-filter"
              value={supplierFilter}
              onChange={(event) => setSupplierFilter(event.target.value)}
            >
              <option value="all">Tous les fournisseurs</option>
              {supplierOptions.hasNoSupplier ? (
                <option value="none">Sans fournisseur</option>
              ) : null}
              {supplierOptions.suppliers.map(([supplierId, supplierName]) => (
                <option key={supplierId} value={supplierId}>
                  {supplierName}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1">
            <label
              className="text-xs font-medium text-muted-foreground"
              htmlFor="transactions-date-filter"
            >
              Date
            </label>
            <Select
              id="transactions-date-filter"
              value={dateFilter}
              onChange={(event) =>
                setDateFilter(event.target.value as DateFilter)
              }
            >
              <option value="all">Toutes les dates</option>
              <option value="last_7_days">7 derniers jours</option>
              <option value="last_30_days">30 derniers jours</option>
              <option value="current_month">Mois en cours</option>
            </Select>
          </div>
        </div>
      ) : null}

      {pageError ? (
        <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {getApiErrorMessage(pageError)}
          <Button
            className="ml-3"
            size="sm"
            variant="outline"
            onClick={retryQueries}
          >
            Réessayer
          </Button>
        </div>
      ) : null}

      <div className="mt-6 overflow-hidden rounded-lg border border-border bg-card">
        <TableToolbar
          searchValue={search}
          searchPlaceholder="Rechercher fournisseur, catégorie, poste, montant..."
          onSearchChange={setSearch}
          actions={
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="whitespace-nowrap">{transactionCountLabel}</span>
              <Select
                className="w-24"
                aria-label="Transactions par page"
                value={String(pageSize)}
                onChange={(event) => setPageSize(Number(event.target.value))}
              >
                {paginationPageSizeOptions.map((option) => (
                  <option key={option} value={option}>
                    {option} / p.
                  </option>
                ))}
              </Select>
            </div>
          }
        />
        {isRefreshing ? (
          <div className="border-b border-border px-4 py-2 text-xs text-muted-foreground">
            Actualisation des transactions...
          </div>
        ) : null}
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHeader field="date" sort={sort} onSort={updateSort}>
                Date
              </SortableHeader>
              <TableHead className="whitespace-nowrap">Type</TableHead>
              <TableHead className="whitespace-nowrap">Fournisseur</TableHead>
              <TableHead className="whitespace-nowrap">Catégorie</TableHead>
              <TableHead className="whitespace-nowrap">Poste budget</TableHead>
              <SortableHeader
                align="right"
                field="amount"
                sort={sort}
                onSort={updateSort}
              >
                Montant TTC
              </SortableHeader>
              <TableHead className="whitespace-nowrap">Statut</TableHead>
              <TableHead className="text-right whitespace-nowrap">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>{renderTableBody()}</TableBody>
        </Table>
        <PaginationFooter
          pageStart={pageStart}
          pageSize={pageSize}
          totalCount={totalCount}
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
        />
      </div>

      {project && transactionReview ? (
        <TransactionReviewModal
          project={project}
          context={transactionReview.context}
          suppliers={suppliers}
          isBudgetSelected={
            transactionReview.context.transaction.select_as_budget
          }
          canToggleBudgetSelection={canToggleBudgetSelection(
            transactionReview.context.transaction,
          )}
          onToggleBudgetSelection={() => undefined}
          onClose={() => setTransactionReview(null)}
        />
      ) : null}

      {documentViewer.isOpen && documentViewer.document ? (
        <DocumentViewerDialog
          title={documentViewer.contextLabel}
          positionLabel={formatDocumentPositionLabel(
            documentViewer.index + 1,
            documentViewer.count,
          )}
          subtitle={formatOriginalFilename(
            documentViewer.document.original_filename,
          )}
          url={documentViewer.url}
          isPending={documentViewer.isLoading}
          error={documentViewer.error}
          onClose={documentViewer.close}
          onDownload={() => void documentViewer.download()}
          onPrevious={documentViewer.goToPrevious}
          onNext={documentViewer.goToNext}
          hasPrevious={documentViewer.index > 0}
          hasNext={documentViewer.index < documentViewer.count - 1}
        />
      ) : null}

      {transactionDelete ? (
        <DeleteTransactionDialog
          context={transactionDelete}
          projectId={projectId}
          onCancel={() => setTransactionDelete(null)}
          onConfirm={() => setTransactionDelete(null)}
        />
      ) : null}
    </section>
  )
}
