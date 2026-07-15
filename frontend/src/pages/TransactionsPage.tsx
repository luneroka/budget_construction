import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Edit3,
  Eye,
  FileSearch,
  Paperclip,
  Trash2,
} from 'lucide-react'

import { getApiErrorMessage } from '@/api/client'
import {
  getDocumentDownloadUrl,
  getTransactionDocuments,
} from '@/api/documents'
import { useProjectQuery } from '@/api/projects'
import { useSuppliersQuery } from '@/api/suppliers'
import { useProjectTransactionsQuery } from '@/api/transactions'
import type { ProjectRead } from '@/api/types'
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
import { TableToolbar } from '@/components/shared/TableToolbar'
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
import type { BudgetLine, Project } from '@/types'
import { suppliersToDomain } from '@/lib/budgetWorkspaceApiAdapter'
import {
  canToggleBudgetSelection,
  isSelectedBudgetTransaction,
  type BudgetSelectionState,
} from '@/lib/budgetDomain'
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
import { downloadDocument } from '@/lib/documents'
import { formatCurrency, formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { notifyError } from '@/lib/toasts'
import { useAppState } from '@/state/appState'

type TransactionTypeFilter =
  'all' | TransactionWorkspaceRow['transaction']['transaction_type']
type DateFilter = 'all' | 'last_7_days' | 'last_30_days' | 'current_month'
type SortField = 'date' | 'amount'
type SortDirection = 'asc' | 'desc'

type SortState = {
  field: SortField
  direction: SortDirection
}

const pageSizeOptions = [25, 50, 100]

function isQuickViewId(value: string | null): value is QuickViewId {
  return quickViews.some((view) => view.id === value)
}

function projectToDomain(project: ProjectRead): Project {
  return {
    id: String(project.id),
    user_id: String(project.user_id),
    template_id: project.template_id ?? 0,
    name: project.name,
    description: project.description ?? '',
    location: project.location ?? '',
    start_date: project.start_date ?? '',
    end_date: project.end_date ?? '',
    project_status: project.project_status,
    selected_budget_amount_ttc: 0,
  }
}

function getBudgetSelection(
  budgetLine: BudgetLine,
): BudgetSelectionState {
  return {
    selected_quote_transaction_id: budgetLine.selected_quote_transaction_id,
    selected_diy_estimate_transaction_id:
      budgetLine.selected_diy_estimate_transaction_id,
  }
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
  const { selectedProjectId } = useAppState()
  const [searchParams, setSearchParams] = useSearchParams()
  const quickViewParam = searchParams.get('quick_view')
  const selectedProjectNumericId = Number(selectedProjectId)
  const projectId = Number.isInteger(selectedProjectNumericId)
    ? selectedProjectNumericId
    : null
  const projectQuery = useProjectQuery(projectId, { enabled: true })
  const transactionsQuery = useProjectTransactionsQuery(projectId, {
    enabled: true,
  })
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
  const [sort, setSort] = useState<SortState>({
    field: 'date',
    direction: 'desc',
  })
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(pageSizeOptions[0])
  const [transactionReview, setTransactionReview] =
    useState<TransactionReviewState | null>(null)
  const [transactionDelete, setTransactionDelete] =
    useState<TransactionDeleteState | null>(null)
  const [viewerDocument, setViewerDocument] = useState<{
    documentId: number
    filename: string
    title: string
    url: string
  } | null>(null)
  const [viewerLoading, setViewerLoading] = useState(false)
  const [viewerError, setViewerError] = useState<string | null>(null)
  const [activeDocumentTransactionId, setActiveDocumentTransactionId] =
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
    let hasAutoconstruction = false

    transactionRows.forEach((row) => {
      if (row.transaction.supplier_id === null) {
        hasAutoconstruction = true
      } else {
        options.set(
          row.transaction.supplier_id,
          row.transaction.supplier_name ?? 'Fournisseur',
        )
      }
    })

    return {
      hasAutoconstruction,
      suppliers: [...options.entries()].sort((left, right) =>
        left[1].localeCompare(right[1], 'fr'),
      ),
    }
  }, [transactionRows])

  useEffect(() => {
    setCurrentPage(1)
  }, [
    activeQuickView,
    categoryFilter,
    dateFilter,
    normalizedSearch,
    pageSize,
    projectId,
    supplierFilter,
    typeFilter,
  ])

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

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize))
  const safeCurrentPage = Math.min(currentPage, totalPages)
  const pageStart = (safeCurrentPage - 1) * pageSize
  const paginatedRows = sortedRows.slice(pageStart, pageStart + pageSize)
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

  function formatDocumentViewerTitle(context: ViewedTransactionContext) {
    const typeLabel =
      transactionTypeLabels[context.transaction.transaction_type]
    const supplier = context.transaction.supplier_name ?? 'Autoconstruction'

    return `${typeLabel} • ${context.product.category_name} • ${supplier} • ${formatCurrency(
      context.transaction.amount_ttc,
    )}`
  }

  async function openTransactionDocumentsViewer(
    context: ViewedTransactionContext,
  ) {
    const transactionId = Number(context.transaction.id)
    if (!Number.isInteger(transactionId)) {
      notifyError('Identifiant de transaction invalide.')
      return
    }

    setActiveDocumentTransactionId(context.transaction.id)
    setViewerLoading(true)
    setViewerError(null)

    try {
      const documents = await getTransactionDocuments(transactionId)
      if (documents.length === 0) {
        const message = 'Aucun document joint à cette transaction.'
        setViewerError(message)
        notifyError(message)
        return
      }

      const document = documents[0]
      const { url } = await getDocumentDownloadUrl(document.id, true)
      setViewerDocument({
        documentId: document.id,
        filename: document.original_filename,
        title: `${document.original_filename} — ${formatDocumentViewerTitle(
          context,
        )}`,
        url,
      })
    } catch (error) {
      const message = getApiErrorMessage(error)
      setViewerError(message)
      notifyError(`Impossible d’ouvrir le document. ${message}`)
    } finally {
      setViewerLoading(false)
      setActiveDocumentTransactionId(null)
    }
  }

  async function handleViewerDownload() {
    if (!viewerDocument) return

    setViewerLoading(true)
    setViewerError(null)

    try {
      await downloadDocument(viewerDocument.documentId, viewerDocument.filename)
    } catch (error) {
      const message = getApiErrorMessage(error)
      setViewerError(message)
      notifyError(`Impossible de télécharger le document. ${message}`)
    } finally {
      setViewerLoading(false)
    }
  }

  function renderTableBody() {
    if (isLoading) {
      return (
        <TransactionTableMessage
          colSpan={9}
          className="py-8 text-center text-muted-foreground"
          message="Chargement des transactions..."
        />
      )
    }

    if (pageError) {
      return (
        <TransactionTableMessage
          colSpan={9}
          className="py-8 text-center text-destructive"
          message="Impossible de charger les transactions."
        />
      )
    }

    if (paginatedRows.length === 0) {
      return (
        <TransactionTableMessage
          colSpan={9}
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
      const documentLabel =
        transaction.document_state === 'attached'
          ? 'Documents joints'
          : 'Documents manquants'

      return (
        <TableRow key={transaction.id}>
          <TableCell className="whitespace-nowrap">
            {formatDate(transaction.issued_date)}
          </TableCell>
          <TableCell className="whitespace-nowrap">
            <StatusBadge status={transaction.transaction_type} />
          </TableCell>
          <TableCell className="min-w-40 font-medium">
            {transaction.supplier_name ?? 'Autoconstruction'}
          </TableCell>
          <TableCell className="min-w-44">{product.category_name}</TableCell>
          <TableCell className="min-w-44">
            {getBudgetLabel(product, budgetLine)}
          </TableCell>
          <TableCell className="whitespace-nowrap text-right font-medium">
            {formatCurrency(transaction.amount_ttc)}
          </TableCell>
          <TableCell className="whitespace-nowrap">
            {status ? (
              <StatusBadge status={status} />
            ) : (
              <span className="text-muted-foreground">-</span>
            )}
          </TableCell>
          <TableCell className="whitespace-nowrap">
            {transaction.document_state === 'attached' ? (
              <Button
                size="sm"
                variant="outline"
                aria-label={`${documentLabel} pour cette transaction`}
                disabled={activeDocumentTransactionId === transaction.id}
                onClick={() => void openTransactionDocumentsViewer(context)}
              >
                <FileSearch aria-hidden />
                Ouvrir
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                aria-label={`${documentLabel} pour cette transaction`}
                onClick={() =>
                  setTransactionReview({ context, initialMode: 'view' })
                }
              >
                <Paperclip aria-hidden />
                Ajouter
              </Button>
            )}
          </TableCell>
          <TableCell className="whitespace-nowrap text-center">
            <div className="inline-flex justify-center gap-1">
              <Button
                size="icon"
                variant="ghost"
                aria-label="Voir la transaction"
                onClick={() =>
                  setTransactionReview({ context, initialMode: 'view' })
                }
              >
                <Eye aria-hidden />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Modifier la transaction"
                onClick={() =>
                  setTransactionReview({ context, initialMode: 'edit' })
                }
              >
                <Edit3 aria-hidden />
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
              size="sm"
              variant={isActive ? 'gold' : 'outline'}
              className="h-7 gap-1.5 rounded-full px-2.5 text-xs"
              onClick={() => selectQuickView(view.id)}
            >
              {view.label}
              <Badge
                variant={isActive ? 'default' : 'muted'}
                className="px-1.5 py-0 text-[10px] leading-4"
              >
                {quickViewCounts[view.id] ?? 0}
              </Badge>
            </Button>
          )
        })}
      </div>

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
            className="h-8 px-2 text-xs"
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
            className="h-8 px-2 text-xs"
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
            className="h-8 px-2 text-xs"
            value={supplierFilter}
            onChange={(event) => setSupplierFilter(event.target.value)}
          >
            <option value="all">Tous les fournisseurs</option>
            {supplierOptions.hasAutoconstruction ? (
              <option value="none">Autoconstruction</option>
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
            className="h-8 px-2 text-xs"
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
              <span>{transactionCountLabel}</span>
              <Select
                className="h-9 w-24"
                aria-label="Transactions par page"
                value={String(pageSize)}
                onChange={(event) => setPageSize(Number(event.target.value))}
              >
                {pageSizeOptions.map((option) => (
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
              <TableHead className="whitespace-nowrap">Documents</TableHead>
              <TableHead className="text-center! whitespace-nowrap">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>{renderTableBody()}</TableBody>
        </Table>
        {sortedRows.length > pageSize ? (
          <div className="flex flex-col gap-3 border-t border-border px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <span>
              {pageStart + 1}-
              {Math.min(pageStart + pageSize, sortedRows.length)} sur{' '}
              {sortedRows.length}
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={safeCurrentPage <= 1}
                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              >
                Précédent
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={safeCurrentPage >= totalPages}
                onClick={() =>
                  setCurrentPage((page) => Math.min(totalPages, page + 1))
                }
              >
                Suivant
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      {project && transactionReview ? (
        <TransactionReviewModal
          project={project}
          context={transactionReview.context}
          initialMode={transactionReview.initialMode}
          suppliers={suppliers}
          isBudgetSelected={isSelectedBudgetTransaction(
            transactionReview.context.transaction,
            getBudgetSelection(transactionReview.context.budgetLine),
          )}
          canToggleBudgetSelection={canToggleBudgetSelection(
            transactionReview.context.transaction,
          )}
          onToggleBudgetSelection={() => undefined}
          onClose={() => setTransactionReview(null)}
        />
      ) : null}

      {viewerDocument ? (
        <DocumentViewerDialog
          title={viewerDocument.title}
          url={viewerDocument.url}
          isPending={viewerLoading}
          error={viewerError}
          onClose={() => {
            setViewerDocument(null)
            setViewerError(null)
          }}
          onDownload={() => void handleViewerDownload()}
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
