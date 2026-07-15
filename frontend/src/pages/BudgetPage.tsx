import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { getApiErrorMessage } from '@/api/client'
import {
  getDocumentDownloadUrl,
  getTransactionDocuments,
} from '@/api/documents'
import { useSuppliersQuery } from '@/api/suppliers'
import { BudgetTree } from '@/components/budget/BudgetTree'
import { DeleteBudgetLineDialog } from '@/components/budget/DeleteBudgetLineDialog'
import { DeleteTransactionDialog } from '@/components/budget/DeleteTransactionDialog'
import { ProductStructureDialog } from '@/components/budget/ProductStructureDialog'
import {
  TransactionModal,
  TransactionReviewModal,
} from '@/components/budget/TransactionModal'
import { DocumentViewerDialog } from '@/components/shared/DocumentViewerDialog'
import type {
  ActiveAction,
  BudgetLineDeleteState,
  BreakdownAction,
  ProductStructureChoice,
  TransactionDeleteState,
  TransactionReviewState,
  TransactionAction,
} from '@/components/budget/types'
import { PageHeader } from '@/components/shared/PageHeader'
import type { Transaction } from '@/types'
import { canToggleBudgetSelection } from '@/lib/budgetDomain'
import {
  suppliersToDomain,
  useBudgetWorkspaceQuery,
} from '@/lib/budgetWorkspaceApiAdapter'
import { downloadDocument } from '@/lib/documents'
import { formatCurrency } from '@/lib/format'
import { notifyError } from '@/lib/toasts'
import { useAppState } from '@/state/appState'

export function BudgetPage() {
  const { selectedProjectId } = useAppState()
  const [searchParams, setSearchParams] = useSearchParams()
  const productFocusParam = searchParams.get('product_id')
  const [focusedProductId, setFocusedProductId] = useState<string | null>(null)
  const [selectedCategoryId, setSelectedCategoryId] = useState('all')
  const [selectedSubcategoryName, setSelectedSubcategoryName] = useState('all')
  const selectedProjectNumericId = Number(selectedProjectId)
  const projectId = Number.isInteger(selectedProjectNumericId)
    ? selectedProjectNumericId
    : null
  const workspaceQuery = useBudgetWorkspaceQuery(projectId)
  const suppliersQuery = useSuppliersQuery({ enabled: projectId !== null })
  const workspace = workspaceQuery.workspace
  const [activeAction, setActiveAction] = useState<ActiveAction | null>(null)
  const [transactionReview, setTransactionReview] =
    useState<TransactionReviewState | null>(null)
  const [viewerDocument, setViewerDocument] = useState<{
    documentId: number
    filename: string
    title: string
    url: string
  } | null>(null)
  const [viewerLoading, setViewerLoading] = useState(false)
  const [viewerError, setViewerError] = useState<string | null>(null)
  const [transactionDelete, setTransactionDelete] =
    useState<TransactionDeleteState | null>(null)
  const [budgetLineDelete, setBudgetLineDelete] =
    useState<BudgetLineDeleteState | null>(null)
  const [selectedStructureChoice, setSelectedStructureChoice] =
    useState<ProductStructureChoice>('single')
  const suppliers = useMemo(
    () => suppliersToDomain(suppliersQuery.data),
    [suppliersQuery.data],
  )
  const selectCategory = useCallback((categoryId: string) => {
    setSelectedCategoryId(categoryId)
    setSelectedSubcategoryName('all')
  }, [])
  const selectSubcategory = useCallback((subcategoryName: string) => {
    setSelectedSubcategoryName(subcategoryName)
  }, [])

  useEffect(() => {
    if (!productFocusParam) return

    setFocusedProductId(productFocusParam)
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current)
        next.delete('product_id')
        return next
      },
      { replace: true },
    )
  }, [productFocusParam, setSearchParams])

  const transactionDocumentTypeLabels: Record<
    Transaction['transaction_type'],
    string
  > = {
    quote: 'Devis',
    diy_estimate: 'Estimation DIY',
    invoice: 'Facture',
  }

  function formatTransactionDocumentTitle(transaction: Transaction): string {
    const typeLabel =
      transactionDocumentTypeLabels[transaction.transaction_type]
    const supplier = transaction.supplier_name ?? 'Autoconstruction'
    const amount = Number.isFinite(transaction.amount_ttc)
      ? formatCurrency(transaction.amount_ttc)
      : '-'

    return `${typeLabel} • ${supplier} • ${amount}`
  }

  async function openTransactionDocumentsViewer(transaction: Transaction) {
    setViewerLoading(true)
    setViewerError(null)

    try {
      const documents = await getTransactionDocuments(Number(transaction.id))
      if (documents.length === 0) {
        setViewerError('Aucun document joint à cette transaction.')
        return
      }

      const document = documents[0]
      const { url } = await getDocumentDownloadUrl(document.id, true)
      setViewerDocument({
        documentId: document.id,
        filename: document.original_filename,
        title: `${document.original_filename} — ${formatTransactionDocumentTitle(
          transaction,
        )}`,
        url,
      })
    } catch (error) {
      const message = getApiErrorMessage(error)
      setViewerError(message)
      notifyError(`Impossible d’ouvrir le document. ${message}`)
    } finally {
      setViewerLoading(false)
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

  if (!projectId) {
    return (
      <section>
        <PageHeader
          title="Budget"
          description="Sélectionnez un projet pour consulter son budget."
        />
        <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
          Aucun projet actif.
        </div>
      </section>
    )
  }

  if (workspaceQuery.isLoading) {
    return (
      <section>
        <PageHeader title="Budget" description="Chargement du budget projet." />
        <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
          Chargement du budget
        </div>
      </section>
    )
  }

  if (workspaceQuery.isError || !workspace) {
    return (
      <section>
        <PageHeader
          title="Budget"
          description="Le budget projet n'a pas pu être chargé."
        />
        <div className="rounded-lg border border-destructive/30 bg-card p-4 text-sm">
          <p className="font-medium text-destructive">Budget indisponible</p>
          <p className="mt-1 text-muted-foreground">
            {workspaceQuery.error
              ? getApiErrorMessage(workspaceQuery.error)
              : 'Aucune donnée budget reçue.'}
          </p>
        </div>
      </section>
    )
  }

  const { categories, project } = workspace

  function openTransactionAction(action: TransactionAction) {
    setActiveAction({ kind: 'transaction', ...action })
  }

  function openStructureChoice(action: BreakdownAction) {
    setSelectedStructureChoice('single')
    setActiveAction({ kind: 'structure-choice', ...action })
  }

  function continueFromStructureChoice(action: BreakdownAction) {
    openTransactionAction({
      product: action.product,
      initialStructure: selectedStructureChoice,
    })
  }

  return (
    <section>
      <PageHeader
        title="Budget"
        description="Espace de travail principal pour ajouter des transactions (devis, factures...) au sein de la hiérarchie de produits."
      />

      <BudgetTree
        categories={categories}
        focusedProductId={focusedProductId}
        selectedCategoryId={selectedCategoryId}
        selectedSubcategoryName={selectedSubcategoryName}
        projectId={projectId}
        onSelectCategory={selectCategory}
        onSelectSubcategory={selectSubcategory}
        onAddBreakdown={(action) =>
          setActiveAction({ kind: 'breakdown', ...action })
        }
        onAddFirstTransaction={openStructureChoice}
        onAddTransaction={openTransactionAction}
        onDecomposeProduct={(action) =>
          setActiveAction({ kind: 'decompose-product', ...action })
        }
        onToggleBudgetSelection={() => {}}
        onRequestDeleteBudgetLine={setBudgetLineDelete}
        onRequestDeleteTransaction={setTransactionDelete}
        onEditTransaction={(context) =>
          setTransactionReview({
            context,
            initialMode: 'edit',
          })
        }
        onViewTransaction={(context) =>
          setTransactionReview({
            context,
            initialMode: 'view',
          })
        }
        onViewTransactionDocuments={openTransactionDocumentsViewer}
      />

      {activeAction?.kind === 'transaction' ? (
        <TransactionModal
          project={project}
          product={activeAction.product}
          budgetLine={activeAction.budgetLine}
          initialStructure={activeAction.initialStructure}
          suppliers={suppliers}
          onClose={() => setActiveAction(null)}
        />
      ) : null}

      {activeAction && activeAction.kind !== 'transaction' ? (
        <ProductStructureDialog
          activeAction={activeAction}
          projectId={projectId}
          selectedStructureChoice={selectedStructureChoice}
          onSelectStructureChoice={setSelectedStructureChoice}
          onContinue={continueFromStructureChoice}
          onClose={() => setActiveAction(null)}
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

      {transactionReview ? (
        <TransactionReviewModal
          project={project}
          context={transactionReview.context}
          initialMode={transactionReview.initialMode}
          suppliers={suppliers}
          isBudgetSelected={transactionReview.context.transaction.select_as_budget}
          canToggleBudgetSelection={canToggleBudgetSelection(
            transactionReview.context.transaction,
          )}
          onToggleBudgetSelection={() => {}}
          onClose={() => setTransactionReview(null)}
        />
      ) : null}

      {budgetLineDelete ? (
        <DeleteBudgetLineDialog
          context={budgetLineDelete}
          projectId={projectId}
          onCancel={() => setBudgetLineDelete(null)}
          onConfirm={() => setBudgetLineDelete(null)}
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

      {categories.length === 0 ? (
        <div className="mt-6 rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
          Aucun poste budgeté pour ce projet.
        </div>
      ) : null}
    </section>
  )
}
