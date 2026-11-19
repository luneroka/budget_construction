import { type FormEvent, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { FilePlus, Pencil } from 'lucide-react'

import { getApiErrorMessage } from '@/api/client'
import {
  invalidateSupplierDocumentQueries,
  useUpdateSupplierDocumentMutation,
  useUploadSupplierDocumentMutation,
} from '@/api/supplier-documents'
import type { SupplierDocumentRead, SupplierDocumentType } from '@/api/types'
import {
  Field,
  NewTransactionDocumentField,
} from '@/components/budget/transaction-form/TransactionFormFields'
import {
  ModalCancelButton,
  ModalSaveButton,
  ModalShell,
} from '@/components/shared/ModalShell'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import {
  SUPPLIER_DOCUMENT_TYPES,
  supplierDocumentTypeLabels,
} from '@/lib/supplierDocuments'
import { notifyError, notifySuccess } from '@/lib/toasts'

const FORM_ID = 'supplier-document-form'

// Adding a document (its file, type and optional expiry date), or editing
// one: the same form without the file, which cannot be replaced. The shell
// carries aria-modal, which holds the auto-update reload while it is open.
export function SupplierDocumentModal({
  supplierId,
  document,
  onClose,
}: {
  supplierId: number
  /** null: a new document. */
  document: SupplierDocumentRead | null
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const uploadMutation = useUploadSupplierDocumentMutation()
  const updateMutation = useUpdateSupplierDocumentMutation()
  const isEditing = document !== null
  const initialType = document?.type ?? ''
  const initialExpiryDate = document?.expiry_date ?? ''
  const [file, setFile] = useState<File | null>(null)
  const [type, setType] = useState<SupplierDocumentType | ''>(initialType)
  const [expiryDate, setExpiryDate] = useState(initialExpiryDate)
  const [error, setError] = useState<string | null>(null)
  const isPending = uploadMutation.isPending || updateMutation.isPending
  const hasUnsavedChanges =
    file !== null || type !== initialType || expiryDate !== initialExpiryDate

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    if (!isEditing && file === null) {
      setError('Choisissez le fichier du document.')
      return
    }
    if (type === '') {
      setError('Choisissez le type du document.')
      return
    }

    try {
      if (isEditing) {
        await updateMutation.mutateAsync({
          documentId: document.id,
          document: { type, expiry_date: expiryDate || null },
        })
      } else if (file !== null) {
        await uploadMutation.mutateAsync({
          supplierId,
          file,
          type,
          expiryDate: expiryDate || null,
        })
      }
      invalidateSupplierDocumentQueries(queryClient, supplierId)
      notifySuccess(isEditing ? 'Document modifié.' : 'Document ajouté.')
      onClose()
    } catch (saveError) {
      const message = getApiErrorMessage(saveError)
      setError(message)
      notifyError(
        isEditing
          ? `Impossible de modifier le document. ${message}`
          : `Impossible d’ajouter le document. ${message}`,
      )
    }
  }

  return (
    <ModalShell
      size="narrow"
      title={isEditing ? 'Modifier le document' : 'Ajouter un document'}
      subtitle={isEditing ? document.original_filename : undefined}
      icon={
        isEditing ? (
          <Pencil className="h-5 w-5" aria-hidden="true" />
        ) : (
          <FilePlus className="h-5 w-5" aria-hidden="true" />
        )
      }
      closeDisabled={isPending}
      hasUnsavedChanges={hasUnsavedChanges}
      onClose={onClose}
      footer={
        <>
          <ModalCancelButton onClick={onClose} disabled={isPending} />
          <ModalSaveButton
            form={FORM_ID}
            disabled={isPending}
            isSaving={isPending}
          >
            {isEditing ? 'Enregistrer' : 'Ajouter le document'}
          </ModalSaveButton>
        </>
      }
    >
      <form id={FORM_ID} className="space-y-4" onSubmit={submit}>
        {isEditing ? null : (
          <NewTransactionDocumentField
            file={file}
            disabled={isPending}
            onFileChange={setFile}
            onClear={() => setFile(null)}
          />
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Type" htmlFor="supplier-document-type">
            <Select
              id="supplier-document-type"
              required
              disabled={isPending}
              value={type}
              onChange={(event) =>
                setType(event.target.value as SupplierDocumentType)
              }
            >
              {type === '' ? (
                <option value="" disabled>
                  Choisir un type
                </option>
              ) : null}
              {SUPPLIER_DOCUMENT_TYPES.map((documentType) => (
                <option key={documentType} value={documentType}>
                  {supplierDocumentTypeLabels[documentType]}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Date d’expiration (facultative)"
            htmlFor="supplier-document-expiry"
          >
            <Input
              id="supplier-document-expiry"
              type="date"
              disabled={isPending}
              value={expiryDate}
              onChange={(event) => setExpiryDate(event.target.value)}
            />
          </Field>
        </div>
        {error ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}
      </form>
    </ModalShell>
  )
}
