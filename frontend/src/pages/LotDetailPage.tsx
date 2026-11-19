import { type FormEvent, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Plus, UserPlus } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'

import { invalidateProjectFinancialQueries } from '@/api/budget-workspace-cache'
import { getApiErrorMessage } from '@/api/client'
import {
  lotQueryKeys,
  useAssignSupplierLotMutation,
  useProjectLotsQuery,
  useSupplierLotsQuery,
  useUnassignSupplierLotMutation,
} from '@/api/lots'
import {
  useProjectFinancialSummaryQuery,
  useProjectQuery,
} from '@/api/projects'
import { useSuppliersQuery } from '@/api/suppliers'
import { useProjectTransactionsQuery } from '@/api/transactions'
import { DeleteTransactionDialog } from '@/components/budget/DeleteTransactionDialog'
import {
  TransactionModal,
  TransactionReviewModal,
} from '@/components/budget/TransactionModal'
import { SupplierSelectField } from '@/components/budget/transaction-form/SupplierSelectField'
import { Field } from '@/components/budget/transaction-form/TransactionFormFields'
import { invoicePrefillFromQuote } from '@/components/budget/transaction-form/transactionForm'
import type {
  TransactionAction,
  TransactionDeleteState,
  TransactionReviewState,
} from '@/components/budget/types'
import { SupplierLotCard } from '@/components/lots/SupplierLotCard'
import { DocumentViewerDialog } from '@/components/shared/DocumentViewerDialog'
import {
  ModalCancelButton,
  ModalSaveButton,
  ModalShell,
} from '@/components/shared/ModalShell'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { Card } from '@/components/ui/card'
import { useTransactionDocumentViewer } from '@/hooks/useTransactionDocumentViewer'
import {
  projectToDomain,
  suppliersToDomain,
  transactionToDomain,
} from '@/lib/apiAdapters'
import {
  formatDocumentPositionLabel,
  formatOriginalFilename,
} from '@/lib/documents'
import { formatCurrency } from '@/lib/format'
import {
  findVisibleLot,
  groupLotTransactionsBySupplier,
  visibleLots,
} from '@/lib/lots'
import { lotSupplierFigures, moneyFigures } from '@/lib/supplierStats'
import { lotLabel, transactionDisplayTitle } from '@/lib/transactionWorkspace'
import { notifyError, notifySuccess } from '@/lib/toasts'
import type { Transaction } from '@/types'
import { useSelectedProjectId } from '@/state/appState'

function AssignSupplierModal({
  projectId,
  lotId,
  suppliers,
  onClose,
}: {
  projectId: number
  lotId: number
  suppliers: ReturnType<typeof suppliersToDomain>
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const assignMutation = useAssignSupplierLotMutation()
  const [supplierId, setSupplierId] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (supplierId === '') return
    setError(null)
    try {
      await assignMutation.mutateAsync({
        projectId,
        supplierId: Number(supplierId),
        lotId,
      })
      void queryClient.invalidateQueries({
        queryKey: lotQueryKeys.supplierLots(projectId),
      })
      notifySuccess('Fournisseur ajouté au lot.')
      onClose()
    } catch (assignError) {
      const message = getApiErrorMessage(assignError)
      setError(message)
      notifyError(`Impossible d’ajouter le fournisseur. ${message}`)
    }
  }

  return (
    <ModalShell
      size="narrow"
      title="Ajouter un fournisseur au lot"
      icon={<UserPlus className="h-5 w-5" aria-hidden="true" />}
      closeDisabled={assignMutation.isPending}
      hasUnsavedChanges={supplierId !== ''}
      onClose={onClose}
      footer={
        <>
          <ModalCancelButton
            onClick={onClose}
            disabled={assignMutation.isPending}
          />
          <ModalSaveButton
            form="assign-supplier-form"
            disabled={assignMutation.isPending || supplierId === ''}
            isSaving={assignMutation.isPending}
          >
            Ajouter
          </ModalSaveButton>
        </>
      }
    >
      <form id="assign-supplier-form" className="space-y-4" onSubmit={submit}>
        <Field label="Fournisseur" htmlFor="assign-supplier">
          <SupplierSelectField
            id="assign-supplier"
            value={supplierId}
            suppliers={suppliers}
            onChange={setSupplierId}
          />
        </Field>
        {error ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}
      </form>
    </ModalShell>
  )
}

// One lot of the project: a card per supplier, plus « Sans fournisseur »
// when some transactions have none, each with its quotes and its invoices.
export function LotDetailPage() {
  const { lotId: lotIdParam } = useParams()
  const queryClient = useQueryClient()
  const projectId = useSelectedProjectId()
  const projectQuery = useProjectQuery(projectId)
  const summaryQuery = useProjectFinancialSummaryQuery(projectId)
  const lotsQuery = useProjectLotsQuery(projectId)
  const transactionsQuery = useProjectTransactionsQuery(projectId)
  const supplierLotsQuery = useSupplierLotsQuery(projectId)
  const suppliersQuery = useSuppliersQuery({ enabled: projectId !== null })
  const unassignMutation = useUnassignSupplierLotMutation()
  const documentViewer = useTransactionDocumentViewer()
  const [activeAction, setActiveAction] = useState<TransactionAction | null>(
    null,
  )
  const [transactionReview, setTransactionReview] =
    useState<TransactionReviewState | null>(null)
  const [transactionDelete, setTransactionDelete] =
    useState<TransactionDeleteState | null>(null)
  const [isAssigningSupplier, setIsAssigningSupplier] = useState(false)

  const suppliers = useMemo(
    () => suppliersToDomain(suppliersQuery.data),
    [suppliersQuery.data],
  )
  const transactions = useMemo(
    () => (transactionsQuery.data ?? []).map(transactionToDomain),
    [transactionsQuery.data],
  )
  const lot = findVisibleLot(lotsQuery.data, lotIdParam)
  const lotSummary = summaryQuery.data?.lots.find(
    (candidate) => candidate.lot_id === lot?.id,
  )
  const pickableLots = visibleLots(lotsQuery.data)

  const isLoading =
    projectQuery.isLoading ||
    lotsQuery.isLoading ||
    transactionsQuery.isLoading ||
    supplierLotsQuery.isLoading ||
    suppliersQuery.isLoading
  const error =
    projectQuery.error ??
    lotsQuery.error ??
    transactionsQuery.error ??
    supplierLotsQuery.error ??
    suppliersQuery.error

  const backLink = (
    <Link
      to="/lots"
      className={buttonVariants({
        variant: 'outline',
        size: 'sm',
        className: 'mb-6',
      })}
    >
      <ArrowLeft aria-hidden="true" />
      Retour aux lots
    </Link>
  )

  if (!projectId) {
    return (
      <section>
        {backLink}
        <PageHeader title="Lot" description="Aucun projet actif." />
      </section>
    )
  }

  if (isLoading) {
    return (
      <section>
        {backLink}
        <PageHeader title="Lot" description="Chargement du lot." />
      </section>
    )
  }

  if (error) {
    return (
      <section>
        {backLink}
        <PageHeader title="Lot" description="Le lot n'a pas pu être chargé." />
        <div className="rounded-lg border border-destructive/30 bg-card p-4 text-sm text-destructive">
          {getApiErrorMessage(error)}
        </div>
      </section>
    )
  }

  if (!lot || !projectQuery.data) {
    return (
      <section>
        {backLink}
        <PageHeader
          title="Lot introuvable"
          description="Ce lot n'existe pas ou est masqué dans ce projet."
        />
      </section>
    )
  }

  const project = projectToDomain(projectQuery.data, summaryQuery.data)
  const supplierNames = new Map(
    suppliers.map((supplier) => [supplier.id, supplier.name]),
  )
  const cards = groupLotTransactionsBySupplier({
    lotId: lot.id,
    transactions,
    assignments: supplierLotsQuery.data ?? [],
    supplierNames,
  })
  const currentLotId = lot.id

  function addInvoiceForQuote(quote: Transaction) {
    setTransactionReview(null)
    setActiveAction({
      lotId: quote.lot_id,
      transactionType: 'invoice',
      prefill: invoicePrefillFromQuote(quote),
    })
  }

  async function unassign(supplierId: string, supplierName: string) {
    if (projectId === null) return
    try {
      await unassignMutation.mutateAsync({
        projectId,
        supplierId: Number(supplierId),
        lotId: currentLotId,
      })
      void queryClient.invalidateQueries({
        queryKey: lotQueryKeys.supplierLots(projectId),
      })
      notifySuccess(`${supplierName} retiré du lot.`)
    } catch (unassignError) {
      notifyError(getApiErrorMessage(unassignError))
    }
  }

  async function openDocuments(transaction: Transaction) {
    await documentViewer.open(
      Number(transaction.id),
      [
        transactionDisplayTitle(transaction),
        formatCurrency(transaction.amount_ttc),
      ].join(' • '),
    )
  }

  const lotFigures = lotSummary ? moneyFigures(lotSummary) : null
  const totals = lotFigures
    ? `Coût prévu ${formatCurrency(lotFigures.plannedTtc)} · Facturé ${formatCurrency(lotFigures.invoicedTtc)} · Payé ${formatCurrency(lotFigures.paidTtc)} · À payer ${formatCurrency(lotFigures.toPayTtc)}`
    : undefined

  return (
    <section>
      {backLink}
      <PageHeader
        title={lotLabel(lot)}
        description={totals}
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => setIsAssigningSupplier(true)}
            >
              <UserPlus aria-hidden="true" />
              Ajouter un fournisseur
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                setActiveAction({ lotId: lot.id, transactionType: 'quote' })
              }
            >
              <Plus aria-hidden="true" />
              Devis
            </Button>
            <Button
              variant="gold"
              onClick={() =>
                setActiveAction({ lotId: lot.id, transactionType: 'invoice' })
              }
            >
              <Plus aria-hidden="true" />
              Facture
            </Button>
          </>
        }
      />

      {cards.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">
          Aucun fournisseur ni transaction dans ce lot. Ajoutez un devis, une
          facture ou un fournisseur pour commencer.
        </Card>
      ) : (
        <div className="space-y-4">
          {cards.map((card) => (
            <SupplierLotCard
              key={card.supplierId ?? 'none'}
              supplierId={card.supplierId}
              supplierName={card.supplierName}
              figures={lotSupplierFigures(lotSummary, card.supplierId)}
              transactions={card.transactions}
              onAdd={(transactionType) =>
                setActiveAction({
                  lotId: lot.id,
                  transactionType,
                  prefill:
                    card.supplierId === null
                      ? undefined
                      : { supplier_id: card.supplierId },
                })
              }
              onView={(transaction) =>
                setTransactionReview({ context: { transaction } })
              }
              onViewDocuments={(transaction) => void openDocuments(transaction)}
              onDelete={(transaction) => setTransactionDelete({ transaction })}
              onAddInvoiceForQuote={addInvoiceForQuote}
              onUnassign={
                card.supplierId !== null && card.transactions.length === 0
                  ? () =>
                      void unassign(
                        card.supplierId as string,
                        card.supplierName,
                      )
                  : undefined
              }
            />
          ))}
        </div>
      )}

      {activeAction ? (
        <TransactionModal
          project={project}
          lots={pickableLots}
          initialLotId={activeAction.lotId}
          initialType={activeAction.transactionType}
          prefill={activeAction.prefill}
          suppliers={suppliers}
          onClose={() => {
            setActiveAction(null)
            invalidateProjectFinancialQueries(queryClient, projectId)
            void queryClient.invalidateQueries({
              queryKey: lotQueryKeys.supplierLots(projectId),
            })
          }}
        />
      ) : null}

      {transactionReview ? (
        <TransactionReviewModal
          project={project}
          context={transactionReview.context}
          lots={pickableLots}
          suppliers={suppliers}
          onAddInvoiceForQuote={addInvoiceForQuote}
          onClose={() => {
            setTransactionReview(null)
            void queryClient.invalidateQueries({
              queryKey: lotQueryKeys.supplierLots(projectId),
            })
          }}
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

      {isAssigningSupplier ? (
        <AssignSupplierModal
          projectId={projectId}
          lotId={lot.id}
          suppliers={suppliers.filter(
            (supplier) =>
              !cards.some((card) => card.supplierId === supplier.id),
          )}
          onClose={() => setIsAssigningSupplier(false)}
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
