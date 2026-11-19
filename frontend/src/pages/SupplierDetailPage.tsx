import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Copy, FileText, Files, Mail, Pencil } from 'lucide-react'

import { getApiErrorMessage } from '@/api/client'
import { useProjectLotsQuery, useSupplierLotsQuery } from '@/api/lots'
import { useProjectQuery } from '@/api/projects'
import { useSupplierDocumentsQuery } from '@/api/supplier-documents'
import { useSupplierQuery, useSuppliersQuery } from '@/api/suppliers'
import { useProjectTransactionsQuery } from '@/api/transactions'
import { TransactionReviewModal } from '@/components/budget/transaction-form/TransactionReviewModal'
import {
  TransactionModal,
  type ViewedTransactionContext,
} from '@/components/budget/TransactionModal'
import { invoicePrefillFromQuote } from '@/components/budget/transaction-form/transactionForm'
import type { TransactionAction } from '@/components/budget/types'
import { SupplierDocumentsTab } from '@/components/suppliers/SupplierDocumentsTab'
import { SupplierModal } from '@/components/suppliers/SupplierModal'
import { SupplierSummaryCards } from '@/components/suppliers/SupplierSummaryCards'
import { DocumentViewerDialog } from '@/components/shared/DocumentViewerDialog'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useSupplierActions } from '@/hooks/useSupplierActions'
import { useTransactionDocumentViewer } from '@/hooks/useTransactionDocumentViewer'
import {
  projectToDomain,
  supplierToDomain,
  suppliersToDomain,
} from '@/lib/apiAdapters'
import { lotsBySupplier, visibleLots } from '@/lib/lots'
import {
  formatDocumentPositionLabel,
  formatOriginalFilename,
} from '@/lib/documents'
import { formatCurrency, formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { copyEmailToClipboard, primaryContact } from '@/lib/supplierContact'
import { supplierTotals } from '@/lib/supplierStats'
import { notifyError } from '@/lib/toasts'
import {
  buildTransactionRow,
  getTransactionStatus,
  lotLabel,
  transactionDisplayTitle,
} from '@/lib/transactionWorkspace'
import { useSelectedProjectId } from '@/state/appState'
import type { Transaction } from '@/types'

export type SupplierDetailTab = 'summary' | 'transactions' | 'documents'

// Each tab is its own URL, so a direct link, the back button and a reload
// keep it: /suppliers/:id is the Synthèse.
function tabPath(supplierId: number, tab: SupplierDetailTab): string {
  return tab === 'summary'
    ? `/suppliers/${supplierId}`
    : `/suppliers/${supplierId}/${tab}`
}

function useSupplierIdParam(): number | null {
  const { supplierId } = useParams<{ supplierId: string }>()
  const parsed = Number(supplierId)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

type TransactionRow = ReturnType<typeof buildTransactionRow>

// The Transactions tab: the supplier's transactions in the project, a row
// opening the review modal, its document buttons.
function SupplierTransactionsTable({
  rows,
  isLoading,
  onReview,
  onOpenDocuments,
}: {
  rows: TransactionRow[]
  isLoading: boolean
  onReview: (context: ViewedTransactionContext) => void
  onOpenDocuments: (context: ViewedTransactionContext) => void
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-28">Date</TableHead>
            <TableHead className="w-28">Type</TableHead>
            <TableHead>Lot</TableHead>
            <TableHead>Libellé</TableHead>
            <TableHead>Référence</TableHead>
            <TableHead className="w-32 text-right">Montant TTC</TableHead>
            <TableHead className="w-28">Statut</TableHead>
            <TableHead className="w-16 text-right">Documents</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow>
              <TableCell colSpan={8} className="text-muted-foreground">
                Chargement des transactions...
              </TableCell>
            </TableRow>
          ) : rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="text-muted-foreground">
                Aucune transaction avec ce fournisseur sur ce projet.
              </TableCell>
            </TableRow>
          ) : (
            rows.map(({ transaction }) => {
              const context = { transaction }
              const status = getTransactionStatus(transaction)

              return (
                <TableRow
                  key={transaction.id}
                  role="button"
                  tabIndex={0}
                  className="cursor-pointer"
                  onClick={(event) => {
                    if (
                      event.target instanceof Element &&
                      event.target.closest('button')
                    ) {
                      return
                    }
                    onReview(context)
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return
                    if (event.target !== event.currentTarget) return
                    event.preventDefault()
                    onReview(context)
                  }}
                >
                  <TableCell className="whitespace-nowrap">
                    {formatDate(transaction.issued_date)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={transaction.transaction_type} />
                  </TableCell>
                  <TableCell>
                    {lotLabel({
                      code: transaction.lot_code,
                      designation: transaction.lot_designation,
                    })}
                  </TableCell>
                  <TableCell>{transaction.title}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {transaction.reference}
                  </TableCell>
                  <TableCell className="text-right font-medium whitespace-nowrap">
                    {formatCurrency(transaction.amount_ttc)}
                  </TableCell>
                  <TableCell>
                    {status ? <StatusBadge status={status} /> : null}
                  </TableCell>
                  <TableCell className="text-right">
                    {transaction.document_state === 'attached' ? (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-muted-foreground hover:bg-gold/15 hover:text-gold"
                        aria-label={
                          transaction.document_count > 1
                            ? 'Voir les documents'
                            : 'Voir le document'
                        }
                        onClick={() => onOpenDocuments(context)}
                      >
                        {transaction.document_count > 1 ? (
                          <Files aria-hidden />
                        ) : (
                          <FileText aria-hidden />
                        )}
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              )
            })
          )}
        </TableBody>
      </Table>
    </div>
  )
}

function SupplierTabs({
  supplierId,
  activeTab,
  transactionCount,
  documentCount,
}: {
  supplierId: number
  activeTab: SupplierDetailTab
  transactionCount: number
  documentCount: number
}) {
  const tabs: Array<{ tab: SupplierDetailTab; label: string }> = [
    { tab: 'summary', label: 'Synthèse' },
    { tab: 'transactions', label: `Transactions (${transactionCount})` },
    { tab: 'documents', label: `Documents (${documentCount})` },
  ]

  return (
    <nav
      aria-label="Sections du fournisseur"
      className="mb-4 flex gap-1 overflow-x-auto border-b border-border"
    >
      {tabs.map(({ tab, label }) => {
        const isActive = tab === activeTab
        return (
          <Link
            key={tab}
            to={tabPath(supplierId, tab)}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              '-mb-px inline-flex h-10 shrink-0 items-center border-b-2 px-3 text-sm font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
              isActive
                ? 'border-gold text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
          </Link>
        )
      })}
    </nav>
  )
}

export function SupplierDetailPage({
  tab = 'summary',
}: {
  tab?: SupplierDetailTab
}) {
  const navigate = useNavigate()
  const supplierId = useSupplierIdParam()
  const projectId = useSelectedProjectId()
  const supplierQuery = useSupplierQuery(supplierId)
  const suppliersQuery = useSuppliersQuery()
  const projectQuery = useProjectQuery(projectId)
  const transactionsQuery = useProjectTransactionsQuery(projectId)
  const supplierDocumentsQuery = useSupplierDocumentsQuery(supplierId)
  const documentViewer = useTransactionDocumentViewer()
  const { saveSupplier, deleteSupplier } = useSupplierActions(projectId)
  const [isEditing, setIsEditing] = useState(false)
  const [transactionReview, setTransactionReview] =
    useState<ViewedTransactionContext | null>(null)
  const [activeAction, setActiveAction] = useState<TransactionAction | null>(
    null,
  )
  const lotsQuery = useProjectLotsQuery(projectId)
  const supplierLotsQuery = useSupplierLotsQuery(projectId)
  const pickableLots = useMemo(
    () => visibleLots(lotsQuery.data),
    [lotsQuery.data],
  )
  // The same source as the Fournisseurs page's « Lots » column: assigned
  // lots show even before their first transaction.
  const supplierLots = useMemo(
    () =>
      lotsBySupplier(supplierLotsQuery.data, lotsQuery.data).get(
        String(supplierId),
      ) ?? [],
    [lotsQuery.data, supplierId, supplierLotsQuery.data],
  )

  const supplier = supplierQuery.data
    ? supplierToDomain(supplierQuery.data)
    : null
  const project = projectQuery.data ? projectToDomain(projectQuery.data) : null
  const suppliers = useMemo(
    () => suppliersToDomain(suppliersQuery.data),
    [suppliersQuery.data],
  )
  const rows = useMemo(
    () =>
      (transactionsQuery.data ?? [])
        .map(buildTransactionRow)
        .filter(
          (row) =>
            row.transaction.supplier_id === String(supplierId) &&
            !row.transaction.deleted_at,
        )
        .sort((left, right) =>
          right.transaction.issued_date.localeCompare(
            left.transaction.issued_date,
          ),
        ),
    [supplierId, transactionsQuery.data],
  )
  const totals = useMemo(
    () => supplierTotals(rows.map((row) => row.transaction)),
    [rows],
  )
  const supplierDocuments = supplierDocumentsQuery.data ?? []

  if (supplierQuery.isLoading) {
    return (
      <section>
        <PageHeader title="Fournisseur" />
        <p className="text-sm text-muted-foreground">Chargement...</p>
      </section>
    )
  }

  if (supplierId === null || supplierQuery.isError || !supplier) {
    return (
      <section>
        <PageHeader title="Fournisseur introuvable" />
        <p className="text-sm text-muted-foreground">
          {supplierQuery.isError
            ? getApiErrorMessage(supplierQuery.error)
            : 'Ce fournisseur n’existe pas ou a été supprimé.'}
        </p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => navigate('/suppliers')}
        >
          <ArrowLeft aria-hidden />
          Retour aux fournisseurs
        </Button>
      </section>
    )
  }

  // Who to write to: the primary contact, else the first contact that has
  // an address.
  const email =
    primaryContact(supplier)?.email?.trim() ||
    supplier.contacts
      .find((contact) => (contact.email ?? '').trim() !== '')
      ?.email?.trim() ||
    ''

  function addInvoiceForQuote(quote: Transaction) {
    setTransactionReview(null)
    setActiveAction({
      lotId: quote.lot_id,
      transactionType: 'invoice',
      prefill: invoicePrefillFromQuote(quote),
    })
  }

  async function openTransactionDocuments(context: ViewedTransactionContext) {
    const transactionId = Number(context.transaction.id)
    if (!Number.isInteger(transactionId)) {
      notifyError('Identifiant de transaction invalide.')
      return
    }

    await documentViewer.open(
      transactionId,
      `${transactionDisplayTitle(context.transaction)} • ${formatCurrency(context.transaction.amount_ttc)}`,
    )
  }

  return (
    <section>
      <Link
        to="/suppliers"
        className={buttonVariants({
          variant: 'ghost',
          size: 'sm',
          className: 'mb-4',
        })}
      >
        <ArrowLeft aria-hidden />
        Retour aux fournisseurs
      </Link>

      <PageHeader
        title={supplier.name}
        description={supplier.comment.trim() || undefined}
        meta={
          supplierLots.length > 0 ? (
            <ul
              aria-label="Lots du fournisseur"
              className="flex flex-wrap gap-1"
            >
              {supplierLots.map((lot) => (
                <li key={lot.id}>
                  <Link
                    to={`/lots/${lot.id}`}
                    className="rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <Badge variant="muted" tone="soft">
                      {lotLabel(lot)}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          ) : undefined
        }
        actions={
          <>
            {email ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    window.location.href = `mailto:${encodeURIComponent(email)}`
                  }}
                >
                  <Mail aria-hidden />
                  Écrire
                </Button>
                <Button
                  variant="outline"
                  onClick={() => void copyEmailToClipboard(email)}
                >
                  <Copy aria-hidden />
                  Copier
                </Button>
              </>
            ) : null}
            <Button variant="outline" onClick={() => setIsEditing(true)}>
              <Pencil aria-hidden />
              Modifier
            </Button>
          </>
        }
      />

      <SupplierTabs
        supplierId={supplierId}
        activeTab={tab}
        transactionCount={rows.length}
        documentCount={supplierDocuments.length}
      />

      {tab === 'summary' ? (
        <SupplierSummaryCards
          supplier={supplier}
          totals={totals}
          documents={supplierDocuments}
          documentsHref={tabPath(supplierId, 'documents')}
        />
      ) : null}

      {tab === 'transactions' ? (
        <SupplierTransactionsTable
          rows={rows}
          isLoading={transactionsQuery.isLoading}
          onReview={setTransactionReview}
          onOpenDocuments={(context) => void openTransactionDocuments(context)}
        />
      ) : null}

      {tab === 'documents' ? (
        <SupplierDocumentsTab
          supplierId={supplierId}
          supplierName={supplier.name}
          documents={supplierDocuments}
          isLoading={supplierDocumentsQuery.isLoading}
          error={
            supplierDocumentsQuery.isError
              ? getApiErrorMessage(supplierDocumentsQuery.error)
              : null
          }
        />
      ) : null}

      {isEditing ? (
        <SupplierModal
          mode="edit"
          supplier={supplier}
          onClose={() => setIsEditing(false)}
          onSave={(edited) => saveSupplier(edited, supplier.id)}
          onDelete={async (deleted) => {
            await deleteSupplier(deleted)
            navigate('/suppliers')
          }}
        />
      ) : null}

      {project && transactionReview ? (
        <TransactionReviewModal
          project={project}
          context={transactionReview}
          lots={pickableLots}
          suppliers={suppliers}
          onAddInvoiceForQuote={addInvoiceForQuote}
          onClose={() => setTransactionReview(null)}
        />
      ) : null}

      {project && activeAction ? (
        <TransactionModal
          project={project}
          lots={pickableLots}
          initialLotId={activeAction.lotId}
          initialType={activeAction.transactionType}
          prefill={activeAction.prefill}
          suppliers={suppliers}
          onClose={() => setActiveAction(null)}
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
    </section>
  )
}
