import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Download, Eye, Pencil, Plus, Trash2 } from 'lucide-react'

import { getApiErrorMessage } from '@/api/client'
import {
  invalidateSupplierDocumentQueries,
  useDeleteSupplierDocumentMutation,
} from '@/api/supplier-documents'
import type { SupplierDocumentRead } from '@/api/types'
import { ConfirmationDialog } from '@/components/shared/ConfirmationDialog'
import { DocumentViewerDialog } from '@/components/shared/DocumentViewerDialog'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useSupplierDocumentViewer } from '@/hooks/useSupplierDocumentViewer'
import {
  downloadSupplierDocument,
  formatOriginalFilename,
} from '@/lib/documents'
import { formatDate, formatFileSize } from '@/lib/format'
import {
  expirySignal,
  supplierDocumentTypeLabels,
} from '@/lib/supplierDocuments'
import { notifyError, notifySuccess } from '@/lib/toasts'

import {
  ExpirySignalBadge,
  SupplierDocumentTypeBadge,
} from './SupplierDocumentBadges'
import { SupplierDocumentModal } from './SupplierDocumentModal'

type FormState = { document: SupplierDocumentRead | null } | null

// The supplier's paperwork: each document with its type, file, upload date
// and expiry, and the add, view, download, edit and delete actions.
export function SupplierDocumentsTab({
  supplierId,
  supplierName,
  documents,
  isLoading,
  error,
}: {
  supplierId: number
  supplierName: string
  documents: SupplierDocumentRead[]
  isLoading: boolean
  error: string | null
}) {
  const queryClient = useQueryClient()
  const deleteMutation = useDeleteSupplierDocumentMutation()
  const viewer = useSupplierDocumentViewer()
  const [form, setForm] = useState<FormState>(null)
  const [pendingDeletion, setPendingDeletion] =
    useState<SupplierDocumentRead | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  async function download(document: SupplierDocumentRead) {
    try {
      await downloadSupplierDocument(document.id, document.original_filename)
    } catch (caught) {
      notifyError(
        `Impossible de télécharger le document. ${getApiErrorMessage(caught)}`,
      )
    }
  }

  async function confirmDeletion(document: SupplierDocumentRead) {
    setDeleteError(null)
    try {
      await deleteMutation.mutateAsync({ documentId: document.id })
      invalidateSupplierDocumentQueries(queryClient, supplierId)
      setPendingDeletion(null)
      notifySuccess('Document déplacé dans la corbeille.')
    } catch (caught) {
      const message = getApiErrorMessage(caught)
      setDeleteError(message)
      notifyError(`Impossible de supprimer le document. ${message}`)
    }
  }

  function renderRows() {
    if (isLoading) {
      return (
        <TableRow>
          <TableCell colSpan={5} className="text-muted-foreground">
            Chargement des documents...
          </TableCell>
        </TableRow>
      )
    }

    if (error) {
      return (
        <TableRow>
          <TableCell colSpan={5} className="text-destructive">
            {error}
          </TableCell>
        </TableRow>
      )
    }

    if (documents.length === 0) {
      return (
        <TableRow>
          <TableCell colSpan={5} className="text-muted-foreground">
            Aucun document pour ce fournisseur.
          </TableCell>
        </TableRow>
      )
    }

    return documents.map((document) => {
      const signal = expirySignal(document.expiry_date)
      const typeLabel = supplierDocumentTypeLabels[document.type]

      return (
        <TableRow key={document.id}>
          <TableCell className="whitespace-nowrap">
            <SupplierDocumentTypeBadge type={document.type} />
          </TableCell>
          <TableCell>
            <p className="font-medium wrap-break-word text-foreground">
              {formatOriginalFilename(document.original_filename)}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatFileSize(document.file_size)}
            </p>
          </TableCell>
          <TableCell className="whitespace-nowrap">
            {formatDate(document.created_at)}
          </TableCell>
          <TableCell className="whitespace-nowrap">
            {document.expiry_date ? (
              <span className="inline-flex items-center gap-2">
                {formatDate(document.expiry_date)}
                {signal ? <ExpirySignalBadge signal={signal} /> : null}
              </span>
            ) : (
              <span className="text-muted-foreground">Sans date</span>
            )}
          </TableCell>
          <TableCell className="text-right">
            <div className="inline-flex justify-end gap-1">
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Voir le document ${typeLabel}`}
                disabled={viewer.isLoading}
                onClick={() => void viewer.open(document, supplierName)}
              >
                <Eye aria-hidden />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Télécharger le document ${typeLabel}`}
                onClick={() => void download(document)}
              >
                <Download aria-hidden />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Modifier le document ${typeLabel}`}
                onClick={() => setForm({ document })}
              >
                <Pencil aria-hidden />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="hover:bg-destructive/10 hover:text-destructive"
                aria-label={`Supprimer le document ${typeLabel}`}
                onClick={() => {
                  setDeleteError(null)
                  setPendingDeletion(document)
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
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button variant="outline" onClick={() => setForm({ document: null })}>
          <Plus aria-hidden />
          Ajouter un document
        </Button>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-48">Type</TableHead>
              <TableHead>Fichier</TableHead>
              <TableHead className="w-28">Ajouté le</TableHead>
              <TableHead className="w-56">Expiration</TableHead>
              <TableHead className="w-44 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>{renderRows()}</TableBody>
        </Table>
      </div>

      {form ? (
        <SupplierDocumentModal
          supplierId={supplierId}
          document={form.document}
          onClose={() => setForm(null)}
        />
      ) : null}

      {pendingDeletion ? (
        <ConfirmationDialog
          title="Supprimer ce document ?"
          description="Ce document sera déplacé dans la corbeille."
          error={deleteError}
          isPending={deleteMutation.isPending}
          onCancel={() => {
            if (deleteMutation.isPending) return
            setPendingDeletion(null)
            setDeleteError(null)
          }}
          onConfirm={() => void confirmDeletion(pendingDeletion)}
        >
          <p className="font-medium text-foreground">
            {supplierDocumentTypeLabels[pendingDeletion.type]}
          </p>
          <p className="mt-1 text-muted-foreground">
            {formatOriginalFilename(pendingDeletion.original_filename)}
          </p>
        </ConfirmationDialog>
      ) : null}

      {viewer.viewed ? (
        <DocumentViewerDialog
          title={viewer.viewed.title}
          subtitle={formatOriginalFilename(
            viewer.viewed.document.original_filename,
          )}
          url={viewer.viewed.url}
          isPending={viewer.isLoading}
          error={viewer.error}
          onClose={viewer.close}
          onDownload={() => void viewer.download()}
        />
      ) : null}
    </div>
  )
}
