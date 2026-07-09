import { useEffect, useState } from 'react'
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { ConfirmationDialog } from '@/components/shared/ConfirmationDialog'
import type { Supplier } from '@/types'

export type SupplierModalMode = 'create' | 'view' | 'edit'

type ContactDraft = {
  id: string
  name: string
  phone_number: string
  email: string
  is_primary: boolean
}

type SupplierFormState = {
  id: string | null
  name: string
  siret: string
  comment: string
  contacts: ContactDraft[]
}

type SupplierModalProps = {
  mode: SupplierModalMode
  supplier: Supplier | null
  onClose: () => void
  onSave: (supplier: Supplier) => Promise<void> | void
  onDelete?: (supplier: Supplier) => Promise<void> | void
}

function emptyContact(supplierId: string, isPrimary = false): ContactDraft {
  return {
    id: `${supplierId}-contact-${crypto.randomUUID()}`,
    name: '',
    phone_number: '',
    email: '',
    is_primary: isPrimary,
  }
}

function supplierToForm(
  supplier: Supplier | null,
): SupplierFormState {
  const supplierId = supplier?.id ?? `supplier-${crypto.randomUUID()}`

  if (supplier === null) {
    return {
      id: null,
      name: '',
      siret: '',
      comment: '',
      contacts: [emptyContact(supplierId, true)],
    }
  }

  return {
    id: supplier.id,
    name: supplier.name,
    siret: supplier.siret ?? '',
    comment: supplier.comment ?? '',
    contacts: supplier.contacts.map<ContactDraft>((contact) => ({
      id: contact.id,
      name: contact.name ?? '',
      phone_number: contact.phone_number ?? '',
      email: contact.email ?? '',
      is_primary: contact.is_primary || supplier.contacts.length === 1,
    })),
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

export function SupplierModal({
  mode,
  supplier,
  onClose,
  onSave,
  onDelete,
}: SupplierModalProps) {
  const [currentMode, setCurrentMode] = useState<SupplierModalMode>(mode)
  const [form, setForm] = useState<SupplierFormState>(() =>
    supplierToForm(supplier),
  )
  const [formError, setFormError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const isReadOnly = currentMode === 'view'
  const isBusy = isSaving || isDeleting

  useEffect(() => {
    setCurrentMode(mode)
    setForm(supplierToForm(supplier))
    setFormError(null)
    setDeleteError(null)
    setDeleteConfirmationOpen(false)
    setIsSaving(false)
    setIsDeleting(false)
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
      await onSave({
        id: supplierId,
        user_id: supplier?.user_id ?? '0',
        name: form.name.trim(),
        siret: normalizeBusinessIdentifier(form.siret),
        comment: normalizeOptional(form.comment) ?? '',
        contacts: form.contacts.map((contact) => ({
          id: contact.id,
          supplier_id: supplierId,
          name: normalizeOptional(contact.name),
          phone_number: normalizeOptional(contact.phone_number),
          email: normalizeOptional(contact.email),
          is_primary: form.contacts.length === 1 ? true : contact.is_primary,
          created_at: null,
          updated_at: null,
        })),
        created_at: supplier?.created_at ?? null,
        updated_at: null,
        deleted_at: supplier?.deleted_at ?? null,
      })
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
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-3 py-4"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-lg border border-border bg-card shadow-xl">
          <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div>
              <h2 className="text-base font-semibold">
                {currentMode === 'create'
                  ? 'Nouveau fournisseur'
                  : readValue(supplier?.name)}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {currentMode === 'view'
                  ? 'Détail fournisseur'
                  : 'Fournisseur et contacts'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {currentMode === 'view' ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isBusy}
                  onClick={() => setCurrentMode('edit')}
                >
                  <Pencil aria-hidden />
                  Modifier
                </Button>
              ) : null}
              <Button
                size="icon"
                variant="ghost"
                aria-label="Fermer"
                disabled={isBusy}
                onClick={onClose}
              >
                <X aria-hidden />
              </Button>
            </div>
          </div>

          <div className="overflow-y-auto px-5 py-4 text-sm">
            {isReadOnly ? (
              <div className="space-y-4">
                <section className="rounded-md border border-border p-4">
                  <h3 className="text-xs font-semibold uppercase text-muted-foreground">
                    Entreprise
                  </h3>
                  <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-xs text-muted-foreground">Nom</dt>
                      <dd className="font-medium">
                        {readValue(supplier?.name)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">
                        SIRET / SIREN
                      </dt>
                      <dd>{readValue(supplier?.siret)}</dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-xs text-muted-foreground">
                        Commentaire
                      </dt>
                      <dd>{readValue(supplier?.comment)}</dd>
                    </div>
                  </dl>
                </section>

                <section className="rounded-md border border-border p-4">
                  <h3 className="text-xs font-semibold uppercase text-muted-foreground">
                    Contacts
                  </h3>
                  <div className="mt-3 grid gap-2">
                    {supplier?.contacts.map((contact) => (
                      <div
                        key={contact.id}
                        className="grid gap-2 px-1 py-1 md:grid-cols-[minmax(11rem,1.1fr)_minmax(10rem,0.9fr)_minmax(16rem,1.4fr)_88px]"
                      >
                        <span className="font-medium">
                          {readValue(contact.name)}
                        </span>
                        <span>{readValue(contact.phone_number)}</span>
                        <span>{readValue(contact.email)}</span>
                        <span className="text-xs text-muted-foreground">
                          {contact.is_primary ? 'Principal' : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
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
                        className="grid gap-2 py-1 lg:grid-cols-[minmax(12rem,1.1fr)_minmax(10rem,0.9fr)_minmax(17rem,1.45fr)_92px_40px]"
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
                          aria-label="Téléphone du contact"
                          placeholder="Téléphone"
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
              </div>
            )}

            {formError ? (
              <p className="mt-3 text-sm text-destructive">{formError}</p>
            ) : null}
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-border px-5 py-3">
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
                  Supprimer
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
          </div>
        </div>
      </div>
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
