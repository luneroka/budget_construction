import { useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Download, Eye, Trash2, Upload, X } from 'lucide-react'

import { getApiErrorMessage } from '@/api/client'
import {
  documentQueryKeys,
  getDocumentDownloadUrl,
  useDeleteDocumentMutation,
  useDocumentsQuery,
  useUploadTransactionDocumentMutation,
} from '@/api/documents'
import type { DocumentListRead } from '@/api/types'
import { PageHeader } from '@/components/shared/PageHeader'
import { ConfirmationDialog } from '@/components/shared/ConfirmationDialog'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { TableToolbar } from '@/components/shared/TableToolbar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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

function formatTransactionTitle(description: string | null): string {
  if (!description) return '-'

  const [documentLabel, ...subjectParts] = description.split(' - ')
  const subject = subjectParts.join(' - ')

  if (!subject) return description

  return `${subject} - ${documentLabel}`
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
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [search, setSearch] = useState('')
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false)
  const [uploadTransactionId, setUploadTransactionId] = useState('')
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [activeDocumentId, setActiveDocumentId] = useState<number | null>(null)
  const [documentPendingDeletion, setDocumentPendingDeletion] =
    useState<DocumentListRead | null>(null)
  const documentsQuery = useDocumentsQuery({ enabled: true })
  const uploadDocumentMutation = useUploadTransactionDocumentMutation()
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

  function openUploadDialog() {
    setUploadDialogOpen(true)
    setUploadError(null)
  }

  function closeUploadDialog() {
    if (uploadDocumentMutation.isPending) return

    setUploadDialogOpen(false)
    setUploadTransactionId('')
    setUploadFile(null)
    setUploadError(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  async function submitUpload() {
    const transactionId = Number(uploadTransactionId)

    if (!Number.isInteger(transactionId) || transactionId <= 0) {
      setUploadError('Identifiant de transaction invalide.')
      return
    }

    if (!uploadFile) {
      setUploadError('Sélectionnez un fichier.')
      return
    }

    setUploadError(null)

    try {
      await uploadDocumentMutation.mutateAsync({
        transactionId,
        file: uploadFile,
      })
      void queryClient.invalidateQueries({
        queryKey: documentQueryKeys.list(false),
      })
      void queryClient.invalidateQueries({
        queryKey: documentQueryKeys.byTransaction(transactionId),
      })
      closeUploadDialog()
    } catch (error) {
      setUploadError(getApiErrorMessage(error))
    }
  }

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
        window.location.assign(url)
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
      void queryClient.invalidateQueries({
        queryKey: documentQueryKeys.list(false),
      })
      void queryClient.invalidateQueries({
        queryKey: documentQueryKeys.byTransaction(document.transaction_id),
      })
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

      return (
        <TableRow key={document.id}>
          <TableCell className="font-medium">
            {document.original_filename}
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
        actions={
          <Button variant="gold" onClick={openUploadDialog}>
            <Upload aria-hidden />
            Téléverser
          </Button>
        }
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

      {uploadDialogOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold">Téléverser</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Associer un fichier à une transaction.
                </p>
              </div>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Fermer"
                disabled={uploadDocumentMutation.isPending}
                onClick={closeUploadDialog}
              >
                <X aria-hidden />
              </Button>
            </div>

            <div className="mt-4 grid gap-3">
              <div>
                <label className="text-xs font-medium" htmlFor="transaction-id">
                  Transaction
                </label>
                <Input
                  id="transaction-id"
                  className="mt-1"
                  inputMode="numeric"
                  placeholder="ID transaction"
                  value={uploadTransactionId}
                  disabled={uploadDocumentMutation.isPending}
                  onChange={(event) =>
                    setUploadTransactionId(event.target.value)
                  }
                />
              </div>
              <div>
                <label className="text-xs font-medium" htmlFor="document-file">
                  Fichier
                </label>
                <Input
                  ref={fileInputRef}
                  id="document-file"
                  className="mt-1"
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.heic,application/pdf,image/jpeg,image/png,image/heic"
                  disabled={uploadDocumentMutation.isPending}
                  onChange={(event) =>
                    setUploadFile(event.target.files?.[0] ?? null)
                  }
                />
              </div>
            </div>

            {uploadError ? (
              <p className="mt-3 text-sm text-destructive">{uploadError}</p>
            ) : null}

            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="ghost"
                disabled={uploadDocumentMutation.isPending}
                onClick={closeUploadDialog}
              >
                Fermer
              </Button>
              <Button
                variant="gold"
                disabled={uploadDocumentMutation.isPending}
                onClick={submitUpload}
              >
                <Upload aria-hidden />
                {uploadDocumentMutation.isPending
                  ? 'Téléversement...'
                  : 'Téléverser'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

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
            {documentPendingDeletion.original_filename}
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
