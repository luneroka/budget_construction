import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  Check,
  Copy,
  Download,
  Paperclip,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react'

import { getApiErrorMessage } from '@/api/client'
import {
  invalidateSupplierDocumentQueries,
  useDeleteSupplierDocumentMutation,
  useSupplierDocumentsQuery,
  useUploadSupplierDocumentMutation,
} from '@/api/supplier-documents'
import type { SupplierDocumentRead } from '@/api/types'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { ConfirmationDialog } from '@/components/shared/ConfirmationDialog'
import { ModalShell } from '@/components/shared/ModalShell'
import { downloadSupplierDocument } from '@/lib/documents'
import {
  documentInputAccept,
  formatFileSize,
  getSelectedFile,
} from '@/lib/files'
import {
  buildPhoneNumber,
  formatPhoneNumber,
  splitPhoneNumber,
} from '@/lib/phone'
import { notifyError, notifySuccess } from '@/lib/toasts'
import type { Supplier } from '@/types'

export type SupplierModalMode = 'create' | 'view' | 'edit'

type ContactDraft = {
  id: string
  name: string
  phone_country_code: string
  phone_number: string
  email: string
  is_primary: boolean
}

type SupplierFormState = {
  id: string | null
  name: string
  siret: string
  comment: string
  street: string
  complement: string
  postal_code: string
  city: string
  contacts: ContactDraft[]
}

type SupplierModalProps = {
  mode: SupplierModalMode
  supplier: Supplier | null
  onClose: () => void
  onSave: (supplier: Supplier) => Promise<Supplier> | Supplier
  onDelete?: (supplier: Supplier) => Promise<void> | void
}

function emptyContact(supplierId: string, isPrimary = false): ContactDraft {
  return {
    id: `${supplierId}-contact-${crypto.randomUUID()}`,
    name: '',
    phone_country_code: '+33',
    phone_number: '',
    email: '',
    is_primary: isPrimary,
  }
}

function supplierToForm(supplier: Supplier | null): SupplierFormState {
  const supplierId = supplier?.id ?? `supplier-${crypto.randomUUID()}`

  if (supplier === null) {
    return {
      id: null,
      name: '',
      siret: '',
      comment: '',
      street: '',
      complement: '',
      postal_code: '',
      city: '',
      contacts: [emptyContact(supplierId, true)],
    }
  }

  return {
    id: supplier.id,
    name: supplier.name,
    siret: supplier.siret ?? '',
    comment: supplier.comment ?? '',
    street: supplier.street ?? '',
    complement: supplier.complement ?? '',
    postal_code: supplier.postal_code ?? '',
    city: supplier.city ?? '',
    contacts: supplier.contacts.map<ContactDraft>((contact) => {
      const phone = splitPhoneNumber(contact.phone_number)

      return {
        id: contact.id,
        name: contact.name ?? '',
        phone_country_code: phone.countryCode,
        phone_number: phone.localNumber,
        email: contact.email ?? '',
        is_primary: contact.is_primary || supplier.contacts.length === 1,
      }
    }),
  }
}

function normalizeOptional(value: string): string | null {
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

function normalizeBusinessIdentifier(value: string): string | null {
  const normalized = value.replace(/\s+/g, '')
  return normalized === '' ? null : normalized
}

function readValue(value: string | null | undefined): string {
  return value?.trim() ? value : '-'
}

function formatAddressForClipboard(supplier: Supplier): string {
  const lines: string[] = []

  if (supplier.street?.trim()) lines.push(supplier.street.trim())
  if (supplier.complement?.trim()) lines.push(supplier.complement.trim())

  const postalCity = [
    supplier.postal_code?.trim(),
    supplier.city?.trim().toUpperCase(),
  ]
    .filter((part) => part)
    .join(' ')
  if (postalCity) lines.push(postalCity)

  return lines.join('\n')
}

async function copyAddressToClipboard(supplier: Supplier) {
  const address = formatAddressForClipboard(supplier)
  if (address === '') return

  try {
    await navigator.clipboard.writeText(address)
    notifySuccess('Adresse copiée dans le presse-papiers.')
  } catch {
    notifyError('Impossible de copier l’adresse.')
  }
}

function numericSupplierId(supplierId: string | null): number | null {
  const parsed = Number(supplierId)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

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

function NewSupplierRibField({
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
      <Input
        key={file ? 'rib-selected' : 'rib-empty'}
        type="file"
        accept={documentInputAccept}
        disabled={disabled}
        onChange={(event) => onFileChange(getSelectedFile(event))}
      />
      {file ? <SelectedRibPreview file={file} onClear={onClear} /> : null}
    </section>
  )
}

function SupplierRibPanel({ supplierId }: { supplierId: number }) {
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

export function SupplierModal({
  mode,
  supplier,
  onClose,
  onSave,
  onDelete,
}: SupplierModalProps) {
  const queryClient = useQueryClient()
  const uploadRibMutation = useUploadSupplierDocumentMutation()
  const [currentMode, setCurrentMode] = useState<SupplierModalMode>(mode)
  const [form, setForm] = useState<SupplierFormState>(() =>
    supplierToForm(supplier),
  )
  const [formError, setFormError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [ribFile, setRibFile] = useState<File | null>(null)
  const [createdSupplierForRib, setCreatedSupplierForRib] =
    useState<Supplier | null>(null)
  const isReadOnly = currentMode === 'view'
  const isBusy = isSaving || isDeleting
  const existingSupplierId = numericSupplierId(supplier?.id ?? null)

  useEffect(() => {
    setCurrentMode(mode)
    setForm(supplierToForm(supplier))
    setFormError(null)
    setDeleteError(null)
    setDeleteConfirmationOpen(false)
    setIsSaving(false)
    setIsDeleting(false)
    setRibFile(null)
    setCreatedSupplierForRib(null)
  }, [mode, supplier])

  function updateContact(contactId: string, updates: Partial<ContactDraft>) {
    setForm((current) => {
      if (updates.is_primary === false) return current

      const contacts = current.contacts.map((contact) => {
        if (contact.id !== contactId) return contact

        return {
          ...contact,
          ...updates,
        }
      })

      return {
        ...current,
        contacts: updates.is_primary
          ? contacts.map((contact) => ({
              ...contact,
              is_primary: contact.id === contactId,
            }))
          : contacts,
      }
    })
  }

  function addContact() {
    setForm((current) => ({
      ...current,
      contacts: [...current.contacts, emptyContact(current.id ?? 'supplier')],
    }))
  }

  function removeContact(contactId: string) {
    setForm((current) => {
      if (current.contacts.length === 1) return current

      const removedContact = current.contacts.find(
        (contact) => contact.id === contactId,
      )
      const remainingContacts = current.contacts.filter(
        (contact) => contact.id !== contactId,
      )

      if (removedContact?.is_primary && remainingContacts.length > 0) {
        remainingContacts[0] = { ...remainingContacts[0], is_primary: true }
      }

      return { ...current, contacts: remainingContacts }
    })
  }

  async function saveSupplier() {
    const hasName = form.name.trim() !== ''
    const primaryContacts = form.contacts.filter(
      (contact) => contact.is_primary || form.contacts.length === 1,
    )
    const hasEmptyContact = form.contacts.some(
      (contact) =>
        contact.name.trim() === '' &&
        contact.phone_number.trim() === '' &&
        contact.email.trim() === '',
    )

    if (!hasName) {
      setFormError('Le nom du fournisseur est obligatoire.')
      return
    }

    if (primaryContacts.length !== 1) {
      setFormError('Un seul contact principal doit être sélectionné.')
      return
    }

    if (hasEmptyContact) {
      setFormError('Chaque contact doit contenir au moins un champ renseigné.')
      return
    }

    const supplierId = form.id ?? `supplier-${crypto.randomUUID()}`
    setIsSaving(true)
    setFormError(null)

    try {
      const contacts = form.contacts.map((contact) => ({
        id: contact.id,
        supplier_id: supplierId,
        name: normalizeOptional(contact.name),
        phone_number: buildPhoneNumber(
          contact.phone_country_code,
          contact.phone_number,
        ),
        email: normalizeOptional(contact.email),
        is_primary: form.contacts.length === 1 ? true : contact.is_primary,
        created_at: null,
        updated_at: null,
      }))

      // A failed RIB upload keeps the modal open after the supplier was
      // created; reuse the created supplier on retry instead of duplicating.
      const savedSupplier =
        createdSupplierForRib ??
        (await onSave({
          id: supplierId,
          user_id: supplier?.user_id ?? '0',
          name: form.name.trim(),
          siret: normalizeBusinessIdentifier(form.siret),
          comment: normalizeOptional(form.comment) ?? '',
          street: normalizeOptional(form.street),
          complement: normalizeOptional(form.complement),
          postal_code: normalizeOptional(form.postal_code),
          city: normalizeOptional(form.city),
          contacts,
          created_at: supplier?.created_at ?? null,
          updated_at: null,
          deleted_at: supplier?.deleted_at ?? null,
        }))

      if (ribFile) {
        const savedSupplierId = numericSupplierId(savedSupplier.id)
        if (savedSupplierId === null) {
          throw new Error('Identifiant fournisseur invalide.')
        }

        setCreatedSupplierForRib(savedSupplier)
        await uploadRibMutation.mutateAsync({
          supplierId: savedSupplierId,
          file: ribFile,
        })
        invalidateSupplierDocumentQueries(queryClient, savedSupplierId)
        notifySuccess('RIB ajouté au fournisseur.')
      }

      onClose()
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : 'Enregistrement impossible.',
      )
    } finally {
      setIsSaving(false)
    }
  }

  async function deleteSupplier() {
    if (!supplier || !onDelete) return

    setIsDeleting(true)
    setDeleteError(null)

    try {
      await onDelete(supplier)
      onClose()
    } catch (error) {
      setDeleteError(
        error instanceof Error ? error.message : 'Suppression impossible.',
      )
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <>
      <ModalShell
        title={
          currentMode === 'create'
            ? 'Nouveau fournisseur'
            : currentMode === 'edit'
              ? 'Modifier le fournisseur'
              : 'Détails du fournisseur'
        }
        icon={
          currentMode === 'edit' ? (
            <Pencil className="h-5 w-5" aria-hidden="true" />
          ) : undefined
        }
        closeDisabled={isBusy}
        onClose={onClose}
        headerActions={
          currentMode === 'view' ? (
            <Button
              size="sm"
              variant="outline"
              disabled={isBusy}
              onClick={() => setCurrentMode('edit')}
            >
              <Pencil aria-hidden />
              Modifier
            </Button>
          ) : null
        }
        footer={
          <>
            <div>
              {isReadOnly && supplier && onDelete ? (
                <Button
                  variant="ghost"
                  disabled={isBusy}
                  className="text-destructive hover:bg-destructive hover:text-destructive-foreground"
                  onClick={() => {
                    setDeleteError(null)
                    setDeleteConfirmationOpen(true)
                  }}
                >
                  <Trash2 aria-hidden />
                  Supprimer le fournisseur
                </Button>
              ) : null}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" disabled={isBusy} onClick={onClose}>
                <X aria-hidden />
                Fermer
              </Button>
              {!isReadOnly ? (
                <Button variant="gold" disabled={isBusy} onClick={saveSupplier}>
                  <Check aria-hidden />
                  {isSaving ? 'Enregistrement...' : 'Enregistrer'}
                </Button>
              ) : null}
            </div>
          </>
        }
      >
        {isReadOnly ? (
          <div className="space-y-4">
            <section className="space-y-3 rounded-md border border-border p-4">
              <h3 className="text-xs font-semibold uppercase text-muted-foreground">
                Entreprise
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label
                    className="text-xs font-medium"
                    htmlFor="supplier-name"
                  >
                    Nom
                  </label>
                  <Input
                    id="supplier-name"
                    className="mt-1 h-9 text-sm"
                    value={readValue(supplier?.name)}
                    readOnly
                    disabled
                  />
                </div>
                <div>
                  <label
                    className="text-xs font-medium"
                    htmlFor="supplier-siret"
                  >
                    SIRET / SIREN
                  </label>
                  <Input
                    id="supplier-siret"
                    className="mt-1 h-9 text-sm"
                    value={readValue(supplier?.siret)}
                    readOnly
                    disabled
                  />
                </div>
              </div>
              <div>
                <label
                  className="text-xs font-medium"
                  htmlFor="supplier-comment"
                >
                  Commentaire
                </label>
                <Input
                  id="supplier-comment"
                  className="mt-1 h-9 text-sm"
                  value={readValue(supplier?.comment)}
                  readOnly
                  disabled
                />
              </div>
            </section>

            <section className="space-y-3 rounded-md border border-border p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-xs font-semibold uppercase text-muted-foreground">
                  Adresse
                </h3>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={
                    !supplier || formatAddressForClipboard(supplier) === ''
                  }
                  onClick={() =>
                    supplier && void copyAddressToClipboard(supplier)
                  }
                >
                  <Copy aria-hidden />
                  Copier l'adresse
                </Button>
              </div>
              <div>
                <label
                  className="text-xs font-medium"
                  htmlFor="supplier-street"
                >
                  Rue
                </label>
                <Input
                  id="supplier-street"
                  className="mt-1 h-9 text-sm"
                  value={readValue(supplier?.street)}
                  readOnly
                  disabled
                />
              </div>
              <div>
                <label
                  className="text-xs font-medium"
                  htmlFor="supplier-complement"
                >
                  Complément d'adresse
                </label>
                <Input
                  id="supplier-complement"
                  className="mt-1 h-9 text-sm"
                  value={readValue(supplier?.complement)}
                  readOnly
                  disabled
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label
                    className="text-xs font-medium"
                    htmlFor="supplier-postal-code"
                  >
                    Code postal
                  </label>
                  <Input
                    id="supplier-postal-code"
                    className="mt-1 h-9 text-sm"
                    value={readValue(supplier?.postal_code)}
                    readOnly
                    disabled
                  />
                </div>
                <div>
                  <label
                    className="text-xs font-medium"
                    htmlFor="supplier-city"
                  >
                    Ville
                  </label>
                  <Input
                    id="supplier-city"
                    className="mt-1 h-9 text-sm"
                    value={readValue(supplier?.city)}
                    readOnly
                    disabled
                  />
                </div>
              </div>
            </section>

            <section className="space-y-3 rounded-md border border-border p-4">
              <h3 className="text-xs font-semibold uppercase text-muted-foreground">
                Contacts
              </h3>
              <div className="grid gap-2">
                {supplier?.contacts.map((contact) => (
                  <div
                    key={contact.id}
                    className="grid gap-2 px-1 py-1 md:grid-cols-[minmax(11rem,1.1fr)_minmax(10rem,0.9fr)_minmax(16rem,1.4fr)_88px]"
                  >
                    <Input
                      className="h-9 text-sm"
                      aria-label="Nom du contact"
                      value={readValue(contact.name)}
                      readOnly
                      disabled
                    />
                    <Input
                      className="h-9 text-sm"
                      aria-label="Téléphone du contact"
                      value={formatPhoneNumber(contact.phone_number)}
                      readOnly
                      disabled
                    />
                    <Input
                      className="h-9 text-sm"
                      aria-label="Email du contact"
                      value={readValue(contact.email)}
                      readOnly
                      disabled
                    />
                    <label className="flex cursor-not-allowed items-center gap-2 text-xs">
                      <Checkbox checked={contact.is_primary} disabled />
                      Principal
                    </label>
                  </div>
                ))}
              </div>
            </section>

            {existingSupplierId !== null ? (
              <SupplierRibPanel supplierId={existingSupplierId} />
            ) : null}
          </div>
        ) : (
          <div className="space-y-4">
            <section className="space-y-3 rounded-md border border-border p-4">
              <h3 className="text-xs font-semibold uppercase text-muted-foreground">
                Entreprise
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label
                    className="text-xs font-medium"
                    htmlFor="supplier-name"
                  >
                    Fournisseur
                  </label>
                  <Input
                    id="supplier-name"
                    className="mt-1 h-9 text-sm"
                    value={form.name}
                    onChange={(event) =>
                      setForm({ ...form, name: event.target.value })
                    }
                  />
                </div>
                <div>
                  <label
                    className="text-xs font-medium"
                    htmlFor="supplier-siret"
                  >
                    SIRET / SIREN
                  </label>
                  <Input
                    id="supplier-siret"
                    className="mt-1 h-9 text-sm"
                    value={form.siret}
                    onChange={(event) =>
                      setForm({ ...form, siret: event.target.value })
                    }
                  />
                </div>
              </div>
              <div>
                <label
                  className="text-xs font-medium"
                  htmlFor="supplier-comment"
                >
                  Commentaire
                </label>
                <Input
                  id="supplier-comment"
                  className="mt-1 h-9 text-sm"
                  value={form.comment}
                  onChange={(event) =>
                    setForm({ ...form, comment: event.target.value })
                  }
                />
              </div>
            </section>

            <section className="space-y-3 rounded-md border border-border p-4">
              <h3 className="text-xs font-semibold uppercase text-muted-foreground">
                Adresse
              </h3>
              <div>
                <label
                  className="text-xs font-medium"
                  htmlFor="supplier-street"
                >
                  Rue
                </label>
                <Input
                  id="supplier-street"
                  className="mt-1 h-9 text-sm"
                  value={form.street}
                  onChange={(event) =>
                    setForm({ ...form, street: event.target.value })
                  }
                />
              </div>
              <div>
                <label
                  className="text-xs font-medium"
                  htmlFor="supplier-complement"
                >
                  Complément d'adresse
                </label>
                <Input
                  id="supplier-complement"
                  className="mt-1 h-9 text-sm"
                  value={form.complement}
                  onChange={(event) =>
                    setForm({ ...form, complement: event.target.value })
                  }
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label
                    className="text-xs font-medium"
                    htmlFor="supplier-postal-code"
                  >
                    Code postal
                  </label>
                  <Input
                    id="supplier-postal-code"
                    className="mt-1 h-9 text-sm"
                    inputMode="numeric"
                    maxLength={5}
                    value={form.postal_code}
                    onChange={(event) =>
                      setForm({ ...form, postal_code: event.target.value })
                    }
                  />
                </div>
                <div>
                  <label
                    className="text-xs font-medium"
                    htmlFor="supplier-city"
                  >
                    Ville
                  </label>
                  <Input
                    id="supplier-city"
                    className="mt-1 h-9 text-sm"
                    value={form.city}
                    onChange={(event) =>
                      setForm({ ...form, city: event.target.value })
                    }
                  />
                </div>
              </div>
            </section>

            <section className="space-y-3 rounded-md border border-border p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-xs font-semibold uppercase text-muted-foreground">
                  Contacts
                </h3>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isBusy}
                  onClick={addContact}
                >
                  <Plus aria-hidden />
                  Ajouter un contact
                </Button>
              </div>

              <div className="grid gap-2">
                {form.contacts.map((contact) => (
                  <div
                    key={contact.id}
                    className="grid gap-2 py-1 lg:grid-cols-[minmax(12rem,1.1fr)_72px_minmax(10rem,0.9fr)_minmax(17rem,1.45fr)_92px_40px]"
                  >
                    <Input
                      className="h-9 text-sm"
                      aria-label="Nom du contact"
                      placeholder="Nom"
                      value={contact.name}
                      onChange={(event) =>
                        updateContact(contact.id, {
                          name: event.target.value,
                        })
                      }
                    />
                    <Input
                      className="h-9 text-sm"
                      aria-label="Indicatif téléphonique"
                      placeholder="+33"
                      value={contact.phone_country_code}
                      onChange={(event) =>
                        updateContact(contact.id, {
                          phone_country_code: event.target.value,
                        })
                      }
                    />
                    <Input
                      className="h-9 text-sm"
                      aria-label="Téléphone du contact"
                      placeholder="7 90 90 90 90"
                      value={contact.phone_number}
                      onChange={(event) =>
                        updateContact(contact.id, {
                          phone_number: event.target.value,
                        })
                      }
                    />
                    <Input
                      className="h-9 text-sm"
                      aria-label="Email du contact"
                      placeholder="Email"
                      value={contact.email}
                      onChange={(event) =>
                        updateContact(contact.id, {
                          email: event.target.value,
                        })
                      }
                    />
                    <label className="flex items-center gap-2 text-xs">
                      <Checkbox
                        checked={
                          contact.is_primary || form.contacts.length === 1
                        }
                        disabled={
                          isBusy ||
                          contact.is_primary ||
                          form.contacts.length === 1
                        }
                        onChange={(event) =>
                          updateContact(contact.id, {
                            is_primary: event.target.checked,
                          })
                        }
                      />
                      Principal
                    </label>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Supprimer le contact"
                      disabled={isBusy || form.contacts.length === 1}
                      onClick={() => removeContact(contact.id)}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </div>
                ))}
              </div>
            </section>

            {currentMode === 'create' ? (
              <NewSupplierRibField
                file={ribFile}
                disabled={isBusy}
                onFileChange={setRibFile}
                onClear={() => setRibFile(null)}
              />
            ) : existingSupplierId !== null ? (
              <SupplierRibPanel supplierId={existingSupplierId} />
            ) : null}
          </div>
        )}

        {formError ? (
          <p className="mt-3 text-sm text-destructive">{formError}</p>
        ) : null}
      </ModalShell>
      {deleteConfirmationOpen && supplier ? (
        <ConfirmationDialog
          title="Supprimer ce fournisseur ?"
          description="Ce fournisseur sera déplacé dans la corbeille. Les transactions existantes ne seront pas supprimées."
          error={deleteError}
          isPending={isDeleting}
          onCancel={() => {
            if (isDeleting) return
            setDeleteConfirmationOpen(false)
            setDeleteError(null)
          }}
          onConfirm={deleteSupplier}
        >
          <p className="font-medium text-foreground">{supplier.name}</p>
          <p className="mt-1 text-muted-foreground">
            {supplier.siret
              ? `SIRET / SIREN ${supplier.siret}`
              : 'Sans SIRET / SIREN'}
          </p>
        </ConfirmationDialog>
      ) : null}
    </>
  )
}
