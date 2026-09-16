import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Download, Paperclip, Trash2 } from 'lucide-react'

import { getApiErrorMessage } from '@/api/client'
import {
  invalidateSupplierDocumentQueries,
  useDeleteSupplierDocumentMutation,
  useSupplierDocumentsQuery,
  useUploadSupplierDocumentMutation,
} from '@/api/supplier-documents'
import type { SupplierDocumentRead } from '@/api/types'
import { ConfirmationDialog } from '@/components/shared/ConfirmationDialog'
import { Button } from '@/components/ui/button'
import { FilePickerButton } from '@/components/shared/FilePickerButton'
import { downloadSupplierDocument } from '@/lib/documents'
import { documentInputAccept, formatFileSize } from '@/lib/files'
import { notifyError, notifySuccess } from '@/lib/toasts'

function SelectedRibPreview({
  file,
  onClear,
}: {
  file: File
  onClear: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2 text-sm">
      <span className="min-w-0">
        <span className="block truncate font-medium text-foreground">
          {file.name}
        </span>
        <span className="text-xs text-muted-foreground">
          {formatFileSize(file.size)}
        </span>
      </span>
      <Button size="sm" variant="ghost" type="button" onClick={onClear}>
        Retirer
      </Button>
    </div>
  )
}

export function NewSupplierRibField({
  file,
  disabled,
  onFileChange,
  onClear,
}: {
  file: File | null
  disabled?: boolean
  onFileChange: (file: File | null) => void
  onClear: () => void
}) {
  return (
    <section className="space-y-3 rounded-md border border-border p-4">
      <h3 className="flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
        <Paperclip className="h-4 w-4" aria-hidden />
        RIB
      </h3>
      <FilePickerButton
        accept={documentInputAccept}
        disabled={disabled}
        label="Choisir un RIB"
        onSelect={onFileChange}
      />
      {file ? <SelectedRibPreview file={file} onClear={onClear} /> : null}
    </section>
  )
}

export function SupplierRibPanel({ supplierId }: { supplierId: number }) {
  const queryClient = useQueryClient()
  const documentsQuery = useSupplierDocumentsQuery(supplierId, {
    enabled: Number.isInteger(supplierId),
  })
  const uploadDocumentMutation = useUploadSupplierDocumentMutation()
  const deleteDocumentMutation = useDeleteSupplierDocumentMutation()
  const [documentError, setDocumentError] = useState<string | null>(null)
  const [documentPendingDeletion, setDocumentPendingDeletion] =
    useState<SupplierDocumentRead | null>(null)
  const isMutating =
    uploadDocumentMutation.isPending || deleteDocumentMutation.isPending

  async function handleUpload(file: File | null) {
    if (!file) return

    try {
      setDocumentError(null)
      await uploadDocumentMutation.mutateAsync({ supplierId, file })
      invalidateSupplierDocumentQueries(queryClient, supplierId)
      notifySuccess('RIB ajouté au fournisseur.')
    } catch (error) {
      const message = getApiErrorMessage(error)
      setDocumentError(message)
      notifyError(`Impossible d’ajouter le RIB. ${message}`)
    }
  }

  async function handleDownload(document: SupplierDocumentRead) {
    try {
      setDocumentError(null)
      await downloadSupplierDocument(document.id, document.original_filename)
    } catch (error) {
      const message = getApiErrorMessage(error)
      setDocumentError(message)
      notifyError(`Impossible de télécharger le RIB. ${message}`)
    }
  }

  async function handleDelete(document: SupplierDocumentRead) {
    try {
      setDocumentError(null)
      await deleteDocumentMutation.mutateAsync({ documentId: document.id })
      invalidateSupplierDocumentQueries(queryClient, supplierId)
      setDocumentPendingDeletion(null)
      notifySuccess('RIB déplacé dans la corbeille.')
    } catch (error) {
      const message = getApiErrorMessage(error)
      setDocumentError(message)
      notifyError(`Impossible de supprimer le RIB. ${message}`)
    }
  }

  const documents = documentsQuery.data ?? []
  const hasAttachedDocuments = documents.length > 0
  const canUploadDocument =
    documentsQuery.isSuccess &&
    !hasAttachedDocuments &&
    !documentsQuery.isFetching

  return (
    <section className="space-y-3 rounded-md border border-border p-4">
      <h3 className="flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
        <Paperclip className="h-4 w-4" aria-hidden />
        RIB
      </h3>

      {documentsQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Chargement du RIB</p>
      ) : documentsQuery.isError ? (
        <p className="text-sm text-destructive">
          {getApiErrorMessage(documentsQuery.error)}
        </p>
      ) : canUploadDocument ? (
        <FilePickerButton
          accept={documentInputAccept}
          disabled={isMutating}
          label="Choisir un RIB"
          onSelect={(file) => void handleUpload(file)}
        />
      ) : null}

      {documentsQuery.isSuccess && documents.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun RIB joint.</p>
      ) : null}

      {documents.length > 0 ? (
        <div className="space-y-2">
          {documents.map((document) => (
            <div
              key={document.id}
              className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium text-foreground">
                  {document.original_filename}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatFileSize(document.file_size)}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  type="button"
                  onClick={() => void handleDownload(document)}
                >
                  <Download aria-hidden />
                  Télécharger
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  type="button"
                  disabled={isMutating}
                  onClick={() => {
                    setDocumentError(null)
                    setDocumentPendingDeletion(document)
                  }}
                >
                  <Trash2 aria-hidden />
                  Supprimer
                </Button>
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {documentError && !documentPendingDeletion ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {documentError}
        </p>
      ) : null}

      {documentPendingDeletion ? (
        <ConfirmationDialog
          title="Supprimer ce RIB ?"
          description="Ce RIB sera déplacé dans la corbeille."
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
    </section>
  )
}
