import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Download, Paperclip, Trash2 } from 'lucide-react'

import { invalidateDocumentQueries } from '@/api/budget-workspace-cache'
import { getApiErrorMessage } from '@/api/client'
import {
  useDeleteDocumentMutation,
  useTransactionDocumentsQuery,
  useUploadTransactionDocumentMutation,
} from '@/api/documents'
import { trashQueryKeys } from '@/api/trash'
import type { DocumentRead } from '@/api/types'
import { ConfirmationDialog } from '@/components/shared/ConfirmationDialog'
import { Input } from '@/components/ui/input'
import { downloadDocument } from '@/lib/documents'
import {
  documentInputAccept,
  formatFileSize,
  getSelectedFile,
} from '@/lib/files'
import { notifyError, notifySuccess } from '@/lib/toasts'

export function TransactionDocumentsPanel({
  transactionId,
  projectId,
  readOnly,
}: {
  transactionId: number
  projectId?: number
  readOnly?: boolean
}) {
  const queryClient = useQueryClient()
  const documentsQuery = useTransactionDocumentsQuery(transactionId, {
    enabled: Number.isInteger(transactionId),
  })
  const uploadDocumentMutation = useUploadTransactionDocumentMutation()
  const deleteDocumentMutation = useDeleteDocumentMutation()
  const [documentError, setDocumentError] = useState<string | null>(null)
  const [documentPendingDeletion, setDocumentPendingDeletion] =
    useState<DocumentRead | null>(null)
  const isMutating =
    uploadDocumentMutation.isPending || deleteDocumentMutation.isPending

  async function handleUpload(file: File | null) {
    if (!file) return

    try {
      setDocumentError(null)
      await uploadDocumentMutation.mutateAsync({ transactionId, file })
      invalidateDocumentQueries(queryClient, transactionId)
      notifySuccess('Document ajouté à la transaction.')
    } catch (error) {
      const message = getApiErrorMessage(error)
      setDocumentError(message)
      notifyError(`Impossible d’ajouter le document. ${message}`)
    }
  }

  async function handleDownload(document: DocumentRead) {
    try {
      setDocumentError(null)
      await downloadDocument(document.id, document.original_filename)
    } catch (error) {
      const message = getApiErrorMessage(error)
      setDocumentError(message)
      notifyError(`Impossible de télécharger le document. ${message}`)
    }
  }

  async function handleDelete(document: DocumentRead) {
    try {
      setDocumentError(null)
      await deleteDocumentMutation.mutateAsync({ documentId: document.id })
      invalidateDocumentQueries(queryClient, transactionId)
      if (projectId) {
        void queryClient.invalidateQueries({
          queryKey: trashQueryKeys.projectList(projectId),
        })
      }
      setDocumentPendingDeletion(null)
      notifySuccess('Document déplacé dans la corbeille.')
    } catch (error) {
      const message = getApiErrorMessage(error)
      setDocumentError(message)
      notifyError(`Impossible de supprimer le document. ${message}`)
    }
  }

  const documents = documentsQuery.data ?? []
  const canUploadDocument = !readOnly && !documentsQuery.isLoading

  return (
    <div className="space-y-3 rounded-md border border-border p-4">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <Paperclip className="h-4 w-4 text-muted-foreground" aria-hidden />
        Documents
      </div>

      {documentsQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">
          Chargement des documents
        </p>
      ) : documentsQuery.isError ? (
        <p className="text-sm text-destructive">
          {getApiErrorMessage(documentsQuery.error)}
        </p>
      ) : (
        <>
          {canUploadDocument ? (
            <Input
              type="file"
              accept={documentInputAccept}
              disabled={isMutating}
              onChange={(event) => {
                const file = getSelectedFile(event)
                event.currentTarget.value = ''
                void handleUpload(file)
              }}
            />
          ) : null}

          {documents.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucun document joint.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {documents.map((document) => (
                <div
                  key={document.id}
                  className="flex items-center gap-1.5 rounded-md border border-border bg-background py-1.5 pr-1.5 pl-3 text-sm"
                >
                  <span
                    className="max-w-40 truncate font-medium text-foreground"
                    title={document.original_filename}
                  >
                    {document.original_filename}
                  </span>
                  <button
                    type="button"
                    className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                    onClick={() => void handleDownload(document)}
                    aria-label={`Télécharger ${document.original_filename}`}
                  >
                    <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  {readOnly ? null : (
                    <button
                      type="button"
                      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:pointer-events-none disabled:opacity-50"
                      disabled={isMutating}
                      onClick={() => {
                        setDocumentError(null)
                        setDocumentPendingDeletion(document)
                      }}
                      aria-label={`Supprimer ${document.original_filename}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {documentError && !documentPendingDeletion ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {documentError}
        </p>
      ) : null}

      {documentPendingDeletion ? (
        <ConfirmationDialog
          title="Supprimer ce document ?"
          description="Ce document sera déplacé dans la corbeille."
          error={documentError}
          isPending={deleteDocumentMutation.isPending}
          onCancel={() => {
            if (deleteDocumentMutation.isPending) return
            setDocumentPendingDeletion(null)
            setDocumentError(null)
          }}
          onConfirm={() => void handleDelete(documentPendingDeletion)}
        >
          <p className="font-medium text-foreground">
            {documentPendingDeletion.original_filename}
          </p>
          <p className="mt-1 text-muted-foreground">
            {formatFileSize(documentPendingDeletion.file_size)}
          </p>
        </ConfirmationDialog>
      ) : null}
    </div>
  )
}
