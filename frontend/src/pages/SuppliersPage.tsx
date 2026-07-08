import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Copy, Mail, Plus } from 'lucide-react'

import { getApiErrorMessage } from '@/api/client'
import { trashQueryKeys } from '@/api/trash'
import {
  supplierQueryKeys,
  useCreateSupplierMutation,
  useDeleteSupplierMutation,
  useSuppliersQuery,
  useUpdateSupplierMutation,
} from '@/api/suppliers'
import type { SupplierCreate, SupplierRead, SupplierUpdate } from '@/api/types'
import { PageHeader } from '@/components/shared/PageHeader'
import { TableToolbar } from '@/components/shared/TableToolbar'
import {
  SupplierModal,
  type SupplierModalMode,
} from '@/components/suppliers/SupplierModal'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type {
  SupplierContactViewModel,
  SupplierRowViewModel,
} from '@/demo/types'
import { notifyError, notifySuccess } from '@/lib/toasts'
import { useAppState } from '@/state/appState'

function supplierToViewModel(supplier: SupplierRead): SupplierRowViewModel {
  return {
    id: String(supplier.id),
    user_id: String(supplier.user_id),
    name: supplier.name,
    siret: supplier.siret,
    comment: supplier.comment ?? '',
    contacts: supplier.contacts.map<SupplierContactViewModel>((contact) => ({
      id: String(contact.id),
      supplier_id: String(contact.supplier_id),
      name: contact.name,
      phone_number: contact.phone_number,
      email: contact.email,
      is_primary: contact.is_primary,
      created_at: contact.created_at,
      updated_at: contact.updated_at,
    })),
    created_at: supplier.created_at,
    updated_at: supplier.updated_at,
    deleted_at: supplier.deleted_at,
  }
}

function numberFromId(id: string): number {
  const value = Number(id)
  if (!Number.isInteger(value)) {
    throw new Error('Identifiant fournisseur invalide.')
  }

  return value
}

function nullableText(value: string | null): string | null {
  const normalized = value?.trim() ?? ''
  return normalized === '' ? null : normalized
}

function nullableBusinessIdentifier(value: string | null): string | null {
  const normalized = value?.replace(/\s+/g, '') ?? ''
  return normalized === '' ? null : normalized
}

function contactsToCreatePayload(
  supplier: SupplierRowViewModel,
): SupplierCreate['contacts'] {
  return supplier.contacts.map((contact) => ({
    name: nullableText(contact.name),
    phone_number: nullableText(contact.phone_number),
    email: nullableText(contact.email),
    is_primary: supplier.contacts.length === 1 ? true : contact.is_primary,
  }))
}

function contactsToUpdatePayload(
  supplier: SupplierRowViewModel,
): NonNullable<SupplierUpdate['contacts']> {
  return supplier.contacts.map((contact) => {
    const contactId = Number(contact.id)

    return {
      id: Number.isInteger(contactId) ? contactId : null,
      name: nullableText(contact.name),
      phone_number: nullableText(contact.phone_number),
      email: nullableText(contact.email),
      is_primary: supplier.contacts.length === 1 ? true : contact.is_primary,
    }
  })
}

function supplierToCreatePayload(
  supplier: SupplierRowViewModel,
): SupplierCreate {
  return {
    name: supplier.name,
    siret: nullableBusinessIdentifier(supplier.siret),
    comment: nullableText(supplier.comment),
    contacts: contactsToCreatePayload(supplier),
  }
}

function supplierToUpdatePayload(
  supplier: SupplierRowViewModel,
): SupplierUpdate {
  return {
    name: supplier.name,
    siret: nullableBusinessIdentifier(supplier.siret),
    comment: nullableText(supplier.comment),
    contacts: contactsToUpdatePayload(supplier),
  }
}

function sortSuppliers(suppliers: SupplierRead[]): SupplierRead[] {
  return [...suppliers].sort((first, second) =>
    first.name.localeCompare(second.name, 'fr', { sensitivity: 'base' }),
  )
}

function upsertSupplier(
  currentSuppliers: SupplierRead[] | undefined,
  supplier: SupplierRead,
): SupplierRead[] {
  const current = currentSuppliers ?? []
  const hasSupplier = current.some((candidate) => candidate.id === supplier.id)
  const next = hasSupplier
    ? current.map((candidate) =>
        candidate.id === supplier.id ? supplier : candidate,
      )
    : [...current, supplier]

  return sortSuppliers(next)
}

function primaryContact(
  supplier: SupplierRowViewModel,
): SupplierContactViewModel | undefined {
  return (
    supplier.contacts.find((contact) => contact.is_primary) ??
    supplier.contacts[0]
  )
}

async function copyEmailToClipboard(email: string) {
  try {
    await navigator.clipboard.writeText(email)
    notifySuccess('Email copié dans le presse-papiers.')
  } catch {
    notifyError('Impossible de copier l’email.')
  }
}

function phoneHref(phoneNumber: string) {
  return `tel:${phoneNumber.replace(/[^\d+]/g, '')}`
}

export function SuppliersPage() {
  const queryClient = useQueryClient()
  const { selectedProjectId } = useAppState()
  const [search, setSearch] = useState('')
  const [modalMode, setModalMode] = useState<SupplierModalMode | null>(null)
  const [selectedSupplier, setSelectedSupplier] =
    useState<SupplierRowViewModel | null>(null)
  const suppliersQuery = useSuppliersQuery({ enabled: true })
  const createSupplierMutation = useCreateSupplierMutation()
  const updateSupplierMutation = useUpdateSupplierMutation()
  const deleteSupplierMutation = useDeleteSupplierMutation()
  const suppliers = useMemo(
    () => (suppliersQuery.data ?? []).map(supplierToViewModel),
    [suppliersQuery.data],
  )
  const normalizedSearch = search.trim().toLowerCase()
  const filteredSuppliers = useMemo(() => {
    if (!normalizedSearch) return suppliers

    return suppliers.filter((supplier) =>
      [
        supplier.name,
        supplier.siret,
        supplier.comment,
        ...supplier.contacts.flatMap((contact) => [
          contact.name,
          contact.phone_number,
          contact.email,
        ]),
      ]
        .filter(Boolean)
        .some((value) =>
          String(value).toLowerCase().includes(normalizedSearch),
        ),
    )
  }, [normalizedSearch, suppliers])
  const isLoadingSuppliers = suppliersQuery.isLoading
  const suppliersError = suppliersQuery.isError
    ? getApiErrorMessage(suppliersQuery.error)
    : null
  const showEmptyState =
    !isLoadingSuppliers && !suppliersError && filteredSuppliers.length === 0
  const showRefreshState =
    suppliersQuery.isFetching && !isLoadingSuppliers && !suppliersError

  function openCreateModal() {
    setSelectedSupplier(null)
    setModalMode('create')
  }

  function openDetailModal(supplier: SupplierRowViewModel) {
    setSelectedSupplier(supplier)
    setModalMode('view')
  }

  function closeModal() {
    setModalMode(null)
    setSelectedSupplier(null)
  }

  async function saveSupplier(savedSupplier: SupplierRowViewModel) {
    try {
      const isCreating = selectedSupplier === null
      const saved = isCreating
        ? await createSupplierMutation.mutateAsync(
            supplierToCreatePayload(savedSupplier),
          )
        : await updateSupplierMutation.mutateAsync({
            supplierId: numberFromId(selectedSupplier.id),
            supplier: supplierToUpdatePayload(savedSupplier),
          })

      queryClient.setQueryData<SupplierRead[]>(
        supplierQueryKeys.list(false),
        (current) => upsertSupplier(current, saved),
      )
      void queryClient.invalidateQueries({
        queryKey: supplierQueryKeys.list(false),
      })
      notifySuccess(isCreating ? 'Fournisseur ajouté.' : 'Fournisseur modifié.')
    } catch (error) {
      const message = getApiErrorMessage(error)
      notifyError(`Impossible d’enregistrer le fournisseur. ${message}`)
      throw new Error(message)
    }
  }

  async function deleteSupplier(supplier: SupplierRowViewModel) {
    try {
      const supplierId = numberFromId(supplier.id)
      await deleteSupplierMutation.mutateAsync(supplierId)
      queryClient.setQueryData<SupplierRead[]>(
        supplierQueryKeys.list(false),
        (current) =>
          current?.filter((candidate) => candidate.id !== supplierId) ?? [],
      )
      void queryClient.invalidateQueries({
        queryKey: supplierQueryKeys.list(false),
      })
      const projectId = Number(selectedProjectId)
      if (Number.isInteger(projectId) && projectId > 0) {
        void queryClient.invalidateQueries({
          queryKey: trashQueryKeys.projectList(projectId),
        })
      }
      notifySuccess('Fournisseur déplacé dans la corbeille.')
    } catch (error) {
      const message = getApiErrorMessage(error)
      notifyError(`Impossible de supprimer le fournisseur. ${message}`)
      throw new Error(message)
    }
  }

  function emptyStateMessage() {
    if (search.trim() !== '') {
      return 'Aucun fournisseur ne correspond à la recherche.'
    }

    return 'Aucun fournisseur enregistré.'
  }

  function renderTableBody() {
    if (isLoadingSuppliers) {
      return (
        <TableRow>
          <TableCell
            colSpan={4}
            className="py-8 text-center text-muted-foreground"
          >
            Chargement des fournisseurs...
          </TableCell>
        </TableRow>
      )
    }

    if (suppliersError) {
      return (
        <TableRow>
          <TableCell colSpan={4} className="py-8 text-center text-destructive">
            Impossible de charger les fournisseurs.
          </TableCell>
        </TableRow>
      )
    }

    return filteredSuppliers.map((supplier) => {
      const contact = primaryContact(supplier)
      const contactEmail = contact?.email?.trim() ?? ''
      const hasEmail = contactEmail !== ''

      return (
        <TableRow key={supplier.id}>
          <TableCell>
            <button
              type="button"
              className="-mx-3 -my-2 inline-flex min-w-48 max-w-full rounded-md px-3 py-2 text-left font-medium text-foreground transition-colors hover:bg-gold/15 hover:text-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              onClick={() => openDetailModal(supplier)}
            >
              <span className="truncate">{supplier.name}</span>
            </button>
          </TableCell>
          <TableCell>{contact?.name ?? '-'}</TableCell>
          <TableCell className="whitespace-nowrap">
            {contact?.phone_number ? (
              <a
                className="-mx-2 -my-1 inline-flex rounded-md px-2 py-1 text-gold underline underline-offset-4 transition-colors hover:bg-gold/15 hover:text-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                href={phoneHref(contact.phone_number)}
              >
                {contact.phone_number}
              </a>
            ) : (
              '-'
            )}
          </TableCell>
          <TableCell>
            <div className="flex min-w-0 items-center justify-between gap-3">
              <span className="min-w-0 truncate">{contact?.email ?? '-'}</span>
              <span className="inline-flex shrink-0 justify-center gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-muted-foreground hover:bg-gold/15 hover:text-gold"
                  aria-label={
                    hasEmail
                      ? `Copier l'email de ${supplier.name}`
                      : `Aucun email à copier pour ${supplier.name}`
                  }
                  disabled={!hasEmail}
                  onClick={() => void copyEmailToClipboard(contactEmail)}
                >
                  <Copy aria-hidden />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-muted-foreground hover:bg-gold/15 hover:text-gold"
                  aria-label={
                    hasEmail
                      ? `Envoyer un email à ${supplier.name}`
                      : `Aucun email pour ${supplier.name}`
                  }
                  disabled={!hasEmail}
                  onClick={() => {
                    window.location.href = `mailto:${encodeURIComponent(contactEmail)}`
                  }}
                >
                  <Mail aria-hidden />
                </Button>
              </span>
            </div>
          </TableCell>
        </TableRow>
      )
    })
  }

  return (
    <section>
      <PageHeader
        title="Fournisseurs"
        description="Répertoire des artisans et fournisseurs."
        actions={
          <Button variant="gold" onClick={openCreateModal}>
            <Plus aria-hidden />
            Nouveau fournisseur
          </Button>
        }
      />

      {suppliersError ? (
        <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {suppliersError}
          <Button
            className="ml-3"
            size="sm"
            variant="outline"
            onClick={() => void suppliersQuery.refetch()}
          >
            Réessayer
          </Button>
        </div>
      ) : null}

      <div className="mt-6 overflow-hidden rounded-lg border border-border bg-card">
        <TableToolbar
          searchValue={search}
          searchPlaceholder="Rechercher fournisseur, contact, email..."
          onSearchChange={setSearch}
        />
        {showRefreshState ? (
          <div className="border-b border-border px-4 py-2 text-xs text-muted-foreground">
            Actualisation des fournisseurs...
          </div>
        ) : null}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fournisseur</TableHead>
              <TableHead>Contact principal</TableHead>
              <TableHead>Téléphone</TableHead>
              <TableHead>Email</TableHead>
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

      {modalMode !== null ? (
        <SupplierModal
          mode={modalMode}
          supplier={selectedSupplier}
          onClose={closeModal}
          onSave={saveSupplier}
          onDelete={deleteSupplier}
        />
      ) : null}
    </section>
  )
}
