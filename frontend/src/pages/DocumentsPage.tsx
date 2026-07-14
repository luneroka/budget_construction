import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Download, Eye, Trash2 } from 'lucide-react'

import { invalidateDocumentQueries } from '@/api/budget-workspace-cache'
import { getApiErrorMessage } from '@/api/client'
import {
  documentQueryKeys,
  getDocumentDownloadUrl,
  useDeleteDocumentMutation,
  useDocumentsQuery,
} from '@/api/documents'
import {
  getSupplierDocumentDownloadUrl,
  invalidateSupplierDocumentQueries,
  useDeleteSupplierDocumentMutation,
} from '@/api/supplier-documents'
import { trashQueryKeys } from '@/api/trash'
import type { DocumentListRead, DocumentsListItem } from '@/api/types'
import { PageHeader } from '@/components/shared/PageHeader'
import { ConfirmationDialog } from '@/components/shared/ConfirmationDialog'
import { DocumentViewerDialog } from '@/components/shared/DocumentViewerDialog'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { TableToolbar } from '@/components/shared/TableToolbar'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { downloadDocument, downloadSupplierDocument } from '@/lib/documents'
import { formatCurrency, formatDate } from '@/lib/format'
import { notifyError, notifySuccess } from '@/lib/toasts'
import { useAppState } from '@/state/appState'

type DocumentAction = 'view' | 'download'

const documentTransactionTypeLabels: Record<
  DocumentListRead['transaction_type'],
  string
> = {
  quote: 'Devis',
  diy_estimate: 'Estimation DIY',
  invoice: 'Facture',
}

function formatTransactionTitle(description: string | null): string | null {
  if (!description) return null

  const [documentLabel, ...subjectParts] = description.split(' - ')
  const subject = subjectParts.join(' - ')

  if (!subject) return description

  return `${subject} - ${documentLabel}`
}

function formatDocumentDisplayName(document: DocumentsListItem): string {
  if (document.type === 'supplier_document') {
    return `RIB • ${document.supplier_name}`
  }

  const typeLabel = documentTransactionTypeLabels[document.transaction_type]
  const supplier = document.supplier_name ?? 'Autoconstruction'
  const amount = document.amount_ttc
    ? formatCurrency(Number(document.amount_ttc))
    : '-'
  const productLabel = document.product_name?.trim()
  const primaryLabel = productLabel ? `${typeLabel} ${productLabel}` : typeLabel

  return `${primaryLabel} • ${supplier} • ${amount}`
}

function sortDocuments(documents: DocumentsListItem[]): DocumentsListItem[] {
  return [...documents].sort(
    (left, right) =>
      new Date(right.created_at).getTime() -
      new Date(left.created_at).getTime(),
  )
}

export function DocumentsPage() {
  const queryClient = useQueryClient()
  const { selectedProjectId } = useAppState()
  const [search, setSearch] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)
  const [activeDocumentId, setActiveDocumentId] = useState<number | null>(null)
  const [documentPendingDeletion, setDocumentPendingDeletion] =
    useState<DocumentsListItem | null>(null)
  const [viewerDocument, setViewerDocument] = useState<{
    document: DocumentsListItem
    url: string
  } | null>(null)
  const [viewerLoading, setViewerLoading] = useState(false)
  const [viewerError, setViewerError] = useState<string | null>(null)
  const documentsQuery = useDocumentsQuery({ enabled: true })
  const deleteDocumentMutation = useDeleteDocumentMutation()
  const deleteSupplierDocumentMutation = useDeleteSupplierDocumentMutation()
  const documents = useMemo(
    () => sortDocuments(documentsQuery.data ?? []),
    [documentsQuery.data],
  )
  const normalizedSearch = search.trim().toLowerCase()
  const filteredDocuments = useMemo(() => {
    if (!normalizedSearch) return documents

    return documents.filter((document) => {
      const searchableValues =
        document.type === 'supplier_document'
          ? [
              document.original_filename,
              formatDocumentDisplayName(document),
              document.supplier_name,
            ]
          : [
              document.original_filename,
              formatDocumentDisplayName(document),
              document.transaction_type,
              document.transaction_description,
              document.supplier_name,
              document.product_name,
              document.amount_ttc,
              String(document.transaction_id),
            ]

      return searchableValues
        .filter(Boolean)
        .some((value) =>
          String(value).toLowerCase().includes(normalizedSearch),
        )
    })
  }, [documents, normalizedSearch])
  const documentsError = documentsQuery.isError
    ? getApiErrorMessage(documentsQuery.error)
    : null
  const isLoadingDocuments = documentsQuery.isLoading
  const showRefreshState =
    documentsQuery.isFetching && !isLoadingDocuments && !documentsError
  const showEmptyState =
    !isLoadingDocuments && !documentsError && filteredDocuments.length === 0
  const pendingDeletionTransactionTitle =
    documentPendingDeletion && documentPendingDeletion.type === 'document'
      ? formatTransactionTitle(documentPendingDeletion.transaction_description)
      : null

  async function openDocumentAction(
    action: DocumentAction,
    document: DocumentsListItem,
  ) {
    setActiveDocumentId(document.id)
    setViewerLoading(true)
    setActionError(null)
    setViewerError(null)

    try {
      if (action === 'download') {
        if (document.type === 'supplier_document') {
          await downloadSupplierDocument(
            document.id,
            document.original_filename,
          )
        } else {
          await downloadDocument(document.id, document.original_filename)
        }
        return
      }

      const { url } =
        document.type === 'supplier_document'
          ? await getSupplierDocumentDownloadUrl(document.id, true)
          : await getDocumentDownloadUrl(document.id, true)

      if (action === 'view') {
        setViewerDocument({ document, url })
      }
    } catch (error) {
      const message = getApiErrorMessage(error)
      setActionError(message)
      notifyError(
        action === 'download'
          ? `Impossible de télécharger le document. ${message}`
          : `Impossible d’ouvrir le document. ${message}`,
      )
    } finally {
      setViewerLoading(false)
      setActiveDocumentId(null)
    }
  }

  async function deleteDocument(document: DocumentsListItem) {
    setActiveDocumentId(document.id)
    setActionError(null)

    try {
      if (document.type === 'supplier_document') {
        await deleteSupplierDocumentMutation.mutateAsync({
          documentId: document.id,
        })
        invalidateSupplierDocumentQueries(queryClient, document.supplier_id)
      } else {
        await deleteDocumentMutation.mutateAsync({ documentId: document.id })
        invalidateDocumentQueries(queryClient, document.transaction_id)
      }
      queryClient.setQueryData<DocumentsListItem[]>(
        documentQueryKeys.list(false),
        (current) =>
          current?.filter(
            (candidate) =>
              candidate.type !== document.type ||
              candidate.id !== document.id,
          ) ?? [],
      )
      const projectId = Number(selectedProjectId)
      if (Number.isInteger(projectId) && projectId > 0) {
        void queryClient.invalidateQueries({
          queryKey: trashQueryKeys.projectList(projectId),
        })
      }
      setDocumentPendingDeletion(null)
      notifySuccess('Document déplacé dans la corbeille.')
    } catch (error) {
      const message = getApiErrorMessage(error)
      setActionError(message)
      notifyError(`Impossible de supprimer le document. ${message}`)
    } finally {
      setActiveDocumentId(null)
    }
  }

  async function handleViewerDownload() {
    if (!viewerDocument) return

    setViewerLoading(true)
    setViewerError(null)

    try {
      if (viewerDocument.document.type === 'supplier_document') {
        await downloadSupplierDocument(
          viewerDocument.document.id,
          viewerDocument.document.original_filename,
        )
      } else {
        await downloadDocument(
          viewerDocument.document.id,
          viewerDocument.document.original_filename,
        )
      }
    } catch (error) {
      const message = getApiErrorMessage(error)
      setViewerError(message)
      notifyError(`Impossible de télécharger le document. ${message}`)
    } finally {
      setViewerLoading(false)
    }
  }

  function emptyStateMessage() {
    if (search.trim() !== '') {
      return 'Aucun document ne correspond à la recherche.'
    }

    return 'Aucun document enregistré.'
  }

  function renderTableBody() {
    if (isLoadingDocuments) {
      return (
        <TableRow>
          <TableCell
            colSpan={5}
            className="py-8 text-center text-muted-foreground"
          >
            Chargement des documents...
          </TableCell>
        </TableRow>
      )
    }

    if (documentsError) {
      return (
        <TableRow>
          <TableCell colSpan={5} className="py-8 text-center text-destructive">
            Impossible de charger les documents.
          </TableCell>
        </TableRow>
      )
    }

    return filteredDocuments.map((document) => {
      const isBusy = activeDocumentId === document.id
      const displayName = formatDocumentDisplayName(document)

      return (
        <TableRow key={`${document.type}-${document.id}`}>
          <TableCell>
            <p className="font-medium text-foreground">{displayName}</p>
            {displayName !== document.original_filename ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Fichier original : {document.original_filename}
              </p>
            ) : null}
          </TableCell>
          <TableCell className="min-w-32 whitespace-nowrap">
            <StatusBadge
              status={
                document.type === 'supplier_document'
                  ? 'rib'
                  : document.transaction_type
              }
            />
          </TableCell>
          <TableCell className="font-medium whitespace-nowrap">
            {document.supplier_name ?? 'Autoconstruction'}
          </TableCell>
          <TableCell className="whitespace-nowrap">
            {formatDate(document.created_at)}
          </TableCell>
          <TableCell className="text-center">
            <div className="inline-flex justify-center gap-1">
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Voir ${document.original_filename}`}
                onClick={() => openDocumentAction('view', document)}
              >
                <Eye aria-hidden />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Télécharger ${document.original_filename}`}
                disabled={isBusy}
                onClick={() => openDocumentAction('download', document)}
              >
                <Download aria-hidden />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Supprimer ${document.original_filename}`}
                disabled={isBusy}
                onClick={() => {
                  setActionError(null)
                  setDocumentPendingDeletion(document)
                }}
              >
                <Trash2 aria-hidden />
              </Button>
            </div>
          </TableCell>
        </TableRow>
      )
    })
  }

  return (
    <section>
      <PageHeader
        title="Documents"
        description="Fichiers rattachés aux transactions et aux fournisseurs."
      />

      {documentsError || actionError ? (
        <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {documentsError ?? actionError}
          {documentsError ? (
            <Button
              className="ml-3"
              size="sm"
              variant="outline"
              onClick={() => void documentsQuery.refetch()}
            >
              Réessayer
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="mt-6 overflow-hidden rounded-lg border border-border bg-card">
        <TableToolbar
          searchValue={search}
          searchPlaceholder="Rechercher fichier, type, transaction..."
          onSearchChange={setSearch}
        />
        {showRefreshState ? (
          <div className="border-b border-border px-4 py-2 text-xs text-muted-foreground">
            Actualisation des documents...
          </div>
        ) : null}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fichier</TableHead>
              <TableHead className="min-w-32">Type</TableHead>
              <TableHead>Fournisseur</TableHead>
              <TableHead>Ajouté le</TableHead>
              <TableHead className="text-center!">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>{renderTableBody()}</TableBody>
        </Table>
        {showEmptyState ? (
          <div className="border-t border-border px-5 py-8 text-center text-sm text-muted-foreground">
            {emptyStateMessage()}
          </div>
        ) : null}
      </div>

      {viewerDocument ? (
        <DocumentViewerDialog
          title={formatDocumentDisplayName(viewerDocument.document)}
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

      {documentPendingDeletion ? (
        <ConfirmationDialog
          title="Supprimer ce document ?"
          description="Ce document sera déplacé dans la corbeille."
          error={actionError}
          isPending={activeDocumentId === documentPendingDeletion.id}
          onCancel={() => {
            if (activeDocumentId === documentPendingDeletion.id) return
            setDocumentPendingDeletion(null)
            setActionError(null)
          }}
          onConfirm={() => deleteDocument(documentPendingDeletion)}
        >
          <p className="font-medium text-foreground">
            {formatDocumentDisplayName(documentPendingDeletion)}
          </p>
          {pendingDeletionTransactionTitle ? (
            <p className="mt-1 text-muted-foreground">
              {pendingDeletionTransactionTitle}
            </p>
          ) : null}
        </ConfirmationDialog>
      ) : null}
    </section>
  )
}
