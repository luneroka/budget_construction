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
import type { DocumentListRead } from '@/api/types'
import { PageHeader } from '@/components/shared/PageHeader'
import { ConfirmationDialog } from '@/components/shared/ConfirmationDialog'
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
import { formatDate, formatFileSize } from '@/lib/format'

type DocumentAction = 'view' | 'download'

const documentTransactionTypeLabels: Record<
  DocumentListRead['transaction_type'],
  string
> = {
  quote: 'Devis',
  diy_estimate: 'Estimation DIY',
  invoice: 'Facture',
}

function filenameExtension(filename: string): string {
  const extension = filename.split('.').pop()
  return extension && extension !== filename ? `.${extension}` : ''
}

function formatTransactionTitle(description: string | null): string {
  if (!description) return '-'

  const [documentLabel, ...subjectParts] = description.split(' - ')
  const subject = subjectParts.join(' - ')

  if (!subject) return description

  return `${subject} - ${documentLabel}`
}

function formatDocumentDisplayName(document: DocumentListRead): string {
  const transactionTitle = formatTransactionTitle(
    document.transaction_description,
  )
  const baseName =
    transactionTitle === '-'
      ? documentTransactionTypeLabels[document.transaction_type]
      : transactionTitle

  return `${baseName}${filenameExtension(document.original_filename)}`
}

function triggerDocumentDownload(url: string, filename: string) {
  const link = window.document.createElement('a')
  link.href = url
  link.download = filename
  link.rel = 'noopener noreferrer'
  window.document.body.appendChild(link)
  link.click()
  link.remove()
}

function sortDocuments(documents: DocumentListRead[]): DocumentListRead[] {
  return [...documents].sort(
    (left, right) =>
      new Date(right.created_at).getTime() -
      new Date(left.created_at).getTime(),
  )
}

export function DocumentsPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)
  const [activeDocumentId, setActiveDocumentId] = useState<number | null>(null)
  const [documentPendingDeletion, setDocumentPendingDeletion] =
    useState<DocumentListRead | null>(null)
  const documentsQuery = useDocumentsQuery({ enabled: true })
  const deleteDocumentMutation = useDeleteDocumentMutation()
  const documents = useMemo(
    () => sortDocuments(documentsQuery.data ?? []),
    [documentsQuery.data],
  )
  const normalizedSearch = search.trim().toLowerCase()
  const filteredDocuments = useMemo(() => {
    if (!normalizedSearch) return documents

    return documents.filter((document) =>
      [
        document.original_filename,
        formatDocumentDisplayName(document),
        document.transaction_type,
        document.transaction_description,
        String(document.transaction_id),
      ]
        .filter(Boolean)
        .some((value) =>
          String(value).toLowerCase().includes(normalizedSearch),
        ),
    )
  }, [documents, normalizedSearch])
  const documentsError = documentsQuery.isError
    ? getApiErrorMessage(documentsQuery.error)
    : null
  const isLoadingDocuments = documentsQuery.isLoading
  const showRefreshState =
    documentsQuery.isFetching && !isLoadingDocuments && !documentsError
  const showEmptyState =
    !isLoadingDocuments && !documentsError && filteredDocuments.length === 0

  async function openDocumentAction(
    action: DocumentAction,
    document: DocumentListRead,
  ) {
    setActiveDocumentId(document.id)
    setActionError(null)

    try {
      const { url } = await getDocumentDownloadUrl(document.id)
      if (action === 'view') {
        window.open(url, '_blank', 'noopener,noreferrer')
      } else {
        triggerDocumentDownload(url, formatDocumentDisplayName(document))
      }
    } catch (error) {
      setActionError(getApiErrorMessage(error))
    } finally {
      setActiveDocumentId(null)
    }
  }

  async function deleteDocument(document: DocumentListRead) {
    setActiveDocumentId(document.id)
    setActionError(null)

    try {
      await deleteDocumentMutation.mutateAsync({ documentId: document.id })
      queryClient.setQueryData<DocumentListRead[]>(
        documentQueryKeys.list(false),
        (current) =>
          current?.filter((candidate) => candidate.id !== document.id) ?? [],
      )
      invalidateDocumentQueries(queryClient, document.transaction_id)
      setDocumentPendingDeletion(null)
    } catch (error) {
      setActionError(getApiErrorMessage(error))
    } finally {
      setActiveDocumentId(null)
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
            colSpan={6}
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
          <TableCell colSpan={6} className="py-8 text-center text-destructive">
            Impossible de charger les documents.
          </TableCell>
        </TableRow>
      )
    }

    return filteredDocuments.map((document) => {
      const isBusy = activeDocumentId === document.id
      const displayName = formatDocumentDisplayName(document)

      return (
        <TableRow key={document.id}>
          <TableCell>
            <p className="font-medium text-foreground">{displayName}</p>
            {displayName !== document.original_filename ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Fichier original : {document.original_filename}
              </p>
            ) : null}
          </TableCell>
          <TableCell className="min-w-32 whitespace-nowrap">
            <StatusBadge status={document.transaction_type} />
          </TableCell>
          <TableCell className="font-medium">
            {formatTransactionTitle(document.transaction_description)}
          </TableCell>
          <TableCell className="whitespace-nowrap">
            {formatDate(document.created_at)}
          </TableCell>
          <TableCell className="min-w-20 whitespace-nowrap text-right font-medium">
            {formatFileSize(document.file_size)}
          </TableCell>
          <TableCell className="text-center">
            <div className="inline-flex justify-center gap-1">
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Voir ${document.original_filename}`}
                disabled={isBusy}
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
        description="Fichiers rattachés aux transactions."
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
              <TableHead>Transaction</TableHead>
              <TableHead>Ajouté le</TableHead>
              <TableHead className="min-w-20 text-right">Taille</TableHead>
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

      {documentPendingDeletion ? (
        <ConfirmationDialog
          title="Supprimer ce document ?"
          description="Ce document sera retiré de la transaction associée."
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
          <p className="mt-1 text-muted-foreground">
            {formatTransactionTitle(
              documentPendingDeletion.transaction_description,
            )}
          </p>
        </ConfirmationDialog>
      ) : null}
    </section>
  )
}
