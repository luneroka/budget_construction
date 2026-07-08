import { useEffect, useMemo, useState } from 'react'
import { useQueries } from '@tanstack/react-query'
import { Edit3, Eye, FileSearch, Paperclip, Trash2 } from 'lucide-react'

import { getApiErrorMessage } from '@/api/client'
import {
  getDocumentDownloadUrl,
  getTransactionDocuments,
} from '@/api/documents'
import { useSuppliersQuery } from '@/api/suppliers'
import {
  getBudgetLineTransactions,
  transactionQueryKeys,
} from '@/api/transactions'
import {
  TransactionReviewModal,
  type ViewedTransactionContext,
} from '@/components/budget/TransactionModal'
import { DeleteTransactionDialog } from '@/components/budget/DeleteTransactionDialog'
import { DocumentViewerDialog } from '@/components/shared/DocumentViewerDialog'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { TableToolbar } from '@/components/shared/TableToolbar'
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
import type {
  TransactionReviewState,
  TransactionDeleteState,
} from '@/components/budget/types'
import type {
  BudgetLineSummaryViewModel,
  ProductSummaryViewModel,
  TransactionViewModel,
} from '@/demo/types'
import {
  suppliersToViewModel,
  transactionToViewModel,
  useBudgetWorkspaceQuery,
} from '@/lib/budgetWorkspaceApiAdapter'
import {
  canToggleBudgetSelection,
  isSelectedBudgetTransaction,
  type BudgetSelectionState,
} from '@/lib/budgetViewModel'
import { downloadDocument } from '@/lib/documents'
import { formatCurrency, formatDate } from '@/lib/format'
import { notifyError } from '@/lib/toasts'
import { useAppState } from '@/state/appState'

type TransactionWorkspaceRow = ViewedTransactionContext & {
  searchText: string
}

const transactionTypeLabels: Record<
  TransactionViewModel['transaction_type'],
  string
> = {
  quote: 'Devis',
  diy_estimate: 'Estimation DIY',
  invoice: 'Facture',
}

const pageSizeOptions = [25, 50, 100]

function getBudgetSelection(
  budgetLine: BudgetLineSummaryViewModel,
): BudgetSelectionState {
  return {
    selected_quote_transaction_id: budgetLine.selected_quote_transaction_id,
    selected_diy_estimate_transaction_id:
      budgetLine.selected_diy_estimate_transaction_id,
  }
}

function getTransactionStatus(transaction: TransactionViewModel) {
  return transaction.quote_status ?? transaction.invoice_status
}

function getBudgetLabel(
  product: ProductSummaryViewModel,
  budgetLine: BudgetLineSummaryViewModel,
) {
  const productName = product.product_name.trim()
  const budgetLineName = budgetLine.name.trim()

  if (productName.toLocaleLowerCase() === budgetLineName.toLocaleLowerCase()) {
    return product.product_name
  }

  return budgetLine.name
}

function buildSearchText({
  product,
  budgetLine,
  transaction,
}: ViewedTransactionContext) {
  return [
    transaction.supplier_name ?? 'Autoconstruction',
    product.category_name,
    product.product_name,
    budgetLine.name,
    transaction.transaction_type,
    transactionTypeLabels[transaction.transaction_type],
    String(transaction.amount_ttc),
    transaction.amount_ttc.toFixed(2),
    formatCurrency(transaction.amount_ttc),
  ]
    .join(' ')
    .toLocaleLowerCase()
}

function sortTransactions(
  rows: TransactionWorkspaceRow[],
): TransactionWorkspaceRow[] {
  return [...rows].sort((left, right) => {
    const dateSort = right.transaction.issued_date.localeCompare(
      left.transaction.issued_date,
    )
    if (dateSort !== 0) return dateSort

    return Number(right.transaction.id) - Number(left.transaction.id)
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

export function TransactionsPage() {
  const { selectedProjectId } = useAppState()
  const selectedProjectNumericId = Number(selectedProjectId)
  const projectId = Number.isInteger(selectedProjectNumericId)
    ? selectedProjectNumericId
    : null
  const workspaceQuery = useBudgetWorkspaceQuery(projectId)
  const suppliersQuery = useSuppliersQuery({ enabled: projectId !== null })
  const workspace = workspaceQuery.workspace
  const [search, setSearch] = useState('')
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
    () => suppliersToViewModel(suppliersQuery.data),
    [suppliersQuery.data],
  )

  const budgetLineContexts = useMemo(() => {
    if (!workspace) return []

    return workspace.financialSummary.products.flatMap((product) =>
      product.budget_lines.map((budgetLine) => ({
        budgetLine,
        product,
      })),
    )
  }, [workspace])

  const transactionQueries = useQueries({
    queries: budgetLineContexts.map(({ budgetLine }) => {
      const budgetLineId = Number(budgetLine.budget_line_id)

      return {
        queryKey:
          projectId === null || !Number.isInteger(budgetLineId)
            ? [...transactionQueryKeys.all, 'missing-budget-line', 'list']
            : transactionQueryKeys.budgetLineList(projectId, budgetLineId),
        queryFn: () => {
          if (projectId === null || !Number.isInteger(budgetLineId)) {
            throw new Error('Identifiant projet ou poste de budget manquant.')
          }

          return getBudgetLineTransactions(projectId, budgetLineId)
        },
        enabled: projectId !== null && Number.isInteger(budgetLineId),
      }
    }),
  })

  const transactionRows = useMemo(() => {
    const rows = budgetLineContexts.flatMap((context, index) =>
      (transactionQueries[index]?.data ?? []).map((transaction) => {
        const viewModel = transactionToViewModel(
          transaction,
          context.budgetLine,
          suppliersQuery.data ?? [],
        )
        const rowContext = {
          ...context,
          transaction: viewModel,
        }

        return {
          ...rowContext,
          searchText: buildSearchText(rowContext),
        }
      }),
    )

    return sortTransactions(rows)
  }, [budgetLineContexts, suppliersQuery.data, transactionQueries])

  const normalizedSearch = search.trim().toLocaleLowerCase()
  const filteredRows = useMemo(() => {
    if (!normalizedSearch) return transactionRows

    return transactionRows.filter((row) =>
      row.searchText.includes(normalizedSearch),
    )
  }, [normalizedSearch, transactionRows])

  useEffect(() => {
    setCurrentPage(1)
  }, [normalizedSearch, pageSize, projectId, transactionRows.length])

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize))
  const safeCurrentPage = Math.min(currentPage, totalPages)
  const pageStart = (safeCurrentPage - 1) * pageSize
  const paginatedRows = filteredRows.slice(pageStart, pageStart + pageSize)
  const transactionQueryError = transactionQueries.find(
    (query) => query.isError,
  )?.error
  const pageError =
    workspaceQuery.error ??
    suppliersQuery.error ??
    transactionQueryError ??
    null
  const isLoading =
    workspaceQuery.isLoading ||
    suppliersQuery.isLoading ||
    transactionQueries.some((query) => query.isLoading)
  const isRefreshing =
    !isLoading &&
    !pageError &&
    (workspaceQuery.isFetching ||
      suppliersQuery.isFetching ||
      transactionQueries.some((query) => query.isFetching))
  const transactionCountLabel = `${filteredRows.length} transaction${
    filteredRows.length > 1 ? 's' : ''
  }`

  function retryQueries() {
    void workspaceQuery.projectQuery.refetch()
    void workspaceQuery.financialSummaryQuery.refetch()
    void workspaceQuery.budgetLinesQuery.refetch()
    void suppliersQuery.refetch()
    transactionQueries.forEach((query) => {
      void query.refetch()
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
        description={
          workspace
            ? `${workspace.project.name} · Vue chronologique de toutes les transactions du projet.`
            : 'Vue chronologique de toutes les transactions du projet.'
        }
      />

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
          searchPlaceholder="Rechercher fournisseur, catégorie, poste, type, montant..."
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
              <TableHead className="whitespace-nowrap">Date</TableHead>
              <TableHead className="whitespace-nowrap">Type</TableHead>
              <TableHead className="whitespace-nowrap">Fournisseur</TableHead>
              <TableHead className="whitespace-nowrap">Catégorie</TableHead>
              <TableHead className="whitespace-nowrap">Poste budget</TableHead>
              <TableHead className="whitespace-nowrap text-right">
                Montant TTC
              </TableHead>
              <TableHead className="whitespace-nowrap">Statut</TableHead>
              <TableHead className="whitespace-nowrap">Documents</TableHead>
              <TableHead className="text-center! whitespace-nowrap">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>{renderTableBody()}</TableBody>
        </Table>
        {filteredRows.length > pageSize ? (
          <div className="flex flex-col gap-3 border-t border-border px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <span>
              {pageStart + 1}-
              {Math.min(pageStart + pageSize, filteredRows.length)} sur{' '}
              {filteredRows.length}
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

      {workspace && transactionReview ? (
        <TransactionReviewModal
          project={workspace.project}
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
